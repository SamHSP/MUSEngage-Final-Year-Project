const VERSION = 4;
const SIZE = 21 + 4 * (VERSION - 1);
const DATA_CODEWORDS = 64;
const EC_CODEWORDS_PER_BLOCK = 18;
const BLOCK_COUNT = 2;
const BLOCK_DATA_CODEWORDS = DATA_CODEWORDS / BLOCK_COUNT;
const FORMAT_INFO_BITS = 0x5412; // Error correction level M with mask pattern 0
const ALIGNMENT_COORDS = [6, 26];

const DEFAULT_MARGIN = 4;
const DEFAULT_SCALE = 8;

const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
let gfValue = 1;
for (let i = 0; i < 255; i += 1) {
  GF_EXP[i] = gfValue;
  GF_LOG[gfValue] = i;
  gfValue <<= 1;
  if (gfValue & 0x100) {
    gfValue ^= 0x11d;
  }
}
for (let i = 255; i < 512; i += 1) {
  GF_EXP[i] = GF_EXP[i - 255];
}

const gfMultiply = (a, b) => {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
};

const generateGeneratorPolynomial = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMultiply(poly[j], GF_EXP[i % 255]);
    }
    poly = next;
  }
  return poly;
};

const GENERATOR = generateGeneratorPolynomial(EC_CODEWORDS_PER_BLOCK);

const computeErrorCorrection = (dataCodewords) => {
  const ec = new Array(EC_CODEWORDS_PER_BLOCK).fill(0);
  for (const codeword of dataCodewords) {
    const factor = codeword ^ ec[0];
    for (let i = 0; i < EC_CODEWORDS_PER_BLOCK - 1; i += 1) {
      ec[i] = ec[i + 1] ^ gfMultiply(GENERATOR[i + 1], factor);
    }
    ec[EC_CODEWORDS_PER_BLOCK - 1] = gfMultiply(GENERATOR[EC_CODEWORDS_PER_BLOCK], factor);
  }
  return ec;
};

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const encodeData = (value) => {
  let dataBytes;
  if (textEncoder) {
    dataBytes = Array.from(textEncoder.encode(value));
  } else {
    dataBytes = Array.from(value).map((char) => char.charCodeAt(0) & 0xff);
  }

  if (dataBytes.length > DATA_CODEWORDS) {
    throw new Error('QR code value is too long for the supported version.');
  }

  const bits = [];
  const pushBits = (number, length) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((number >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(dataBytes.length, 8);
  dataBytes.forEach((byte) => pushBits(byte, 8));

  const totalDataBits = DATA_CODEWORDS * 8;
  const terminatorLength = Math.min(4, totalDataBits - bits.length);
  pushBits(0, terminatorLength);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let valueByte = 0;
    for (let j = 0; j < 8; j += 1) {
      valueByte = (valueByte << 1) | bits[i + j];
    }
    dataCodewords.push(valueByte);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (dataCodewords.length < DATA_CODEWORDS) {
    dataCodewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }

  return dataCodewords;
};

const interleaveBlocks = (dataCodewords) => {
  const blocks = [];
  for (let i = 0; i < BLOCK_COUNT; i += 1) {
    const start = i * BLOCK_DATA_CODEWORDS;
    blocks.push(dataCodewords.slice(start, start + BLOCK_DATA_CODEWORDS));
  }
  const ecBlocks = blocks.map((block) => computeErrorCorrection(block));

  const result = [];
  for (let i = 0; i < BLOCK_DATA_CODEWORDS; i += 1) {
    for (let b = 0; b < BLOCK_COUNT; b += 1) {
      result.push(blocks[b][i]);
    }
  }
  for (let i = 0; i < EC_CODEWORDS_PER_BLOCK; i += 1) {
    for (let b = 0; b < BLOCK_COUNT; b += 1) {
      result.push(ecBlocks[b][i]);
    }
  }
  return result;
};

const createEmptyMatrix = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

const applyFinderPattern = (matrix, top, left) => {
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const isBorder = x === 0 || x === 6 || y === 0 || y === 6;
      const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      matrix[top + y][left + x] = isBorder || isCenter;
    }
  }
  const size = matrix.length;
  for (let i = -1; i <= 7; i += 1) {
    const coords = [
      [left - 1, top + i],
      [left + 7, top + i],
      [left + i, top - 1],
      [left + i, top + 7],
    ];
    coords.forEach(([cx, cy]) => {
      if (cx >= 0 && cx < size && cy >= 0 && cy < size && matrix[cy][cx] === null) {
        matrix[cy][cx] = false;
      }
    });
  }
};

const applyAlignmentPattern = (matrix, centerX, centerY) => {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const isBorder = Math.abs(x) === 2 || Math.abs(y) === 2;
      matrix[centerY + y][centerX + x] = isBorder || (x === 0 && y === 0);
    }
  }
};

const applyTimingPatterns = (matrix) => {
  for (let i = 0; i < SIZE; i += 1) {
    if (matrix[6][i] === null) {
      matrix[6][i] = i % 2 === 0;
    }
    if (matrix[i][6] === null) {
      matrix[i][6] = i % 2 === 0;
    }
  }
};

const applyDarkModule = (matrix) => {
  matrix[SIZE - 8][8] = true;
};

const placeDataBits = (matrix, bits) => {
  let bitIndex = 0;
  let direction = -1; // Start by moving upwards as required by the QR specification
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }
    for (let rowOffset = 0; rowOffset < SIZE; rowOffset += 1) {
      const row = direction === -1 ? SIZE - 1 - rowOffset : rowOffset;
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        const y = row;
        if (matrix[y][x] !== null) {
          continue;
        }
        const bit = bits[bitIndex] ?? 0;
        bitIndex += 1;
        const mask = (x + y) % 2 === 0;
        matrix[y][x] = Boolean(bit ^ (mask ? 1 : 0));
      }
    }
    direction *= -1;
  }
};

const applyFormatInformation = (matrix) => {
  const getBit = (position) => ((FORMAT_INFO_BITS >> position) & 1) === 1;
  for (let i = 0; i < 6; i += 1) {
    matrix[8][i] = getBit(14 - i);
  }
  matrix[8][7] = getBit(8);
  matrix[8][8] = getBit(7);
  matrix[7][8] = getBit(6);
  for (let i = 0; i < 6; i += 1) {
    matrix[5 - i][8] = getBit(i);
  }

  for (let i = 0; i < 8; i += 1) {
    matrix[SIZE - 1 - i][8] = getBit(14 - i);
  }
  for (let i = 0; i < 7; i += 1) {
    matrix[8][SIZE - 1 - i] = getBit(i);
  }
  matrix[8][SIZE - 8] = getBit(7);
};

const generateMatrix = (value) => {
  const dataCodewords = encodeData(value);
  const fullCodewords = interleaveBlocks(dataCodewords);
  const dataBits = [];
  fullCodewords.forEach((codeword) => {
    for (let i = 7; i >= 0; i -= 1) {
      dataBits.push((codeword >> i) & 1);
    }
  });

  const matrix = createEmptyMatrix();
  applyFinderPattern(matrix, 0, 0);
  applyFinderPattern(matrix, 0, SIZE - 7);
  applyFinderPattern(matrix, SIZE - 7, 0);
  applyTimingPatterns(matrix);
  applyDarkModule(matrix);

  ALIGNMENT_COORDS.forEach((cx) => {
    ALIGNMENT_COORDS.forEach((cy) => {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === SIZE - 7) || (cx === SIZE - 7 && cy === 6)) {
        return;
      }
      applyAlignmentPattern(matrix, cx, cy);
    });
  });

  placeDataBits(matrix, dataBits);
  applyFormatInformation(matrix);

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
};

const ensureCanvas = (canvas) => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('A valid canvas element is required.');
  }
  return canvas;
};

const resolveScale = (totalModules, options, targetSize) => {
  if (options && typeof options.scale === 'number' && options.scale > 0) {
    return Math.floor(options.scale);
  }
  if (targetSize) {
    return Math.max(1, Math.ceil(targetSize / totalModules));
  }
  return DEFAULT_SCALE;
};

const resolveMargin = (options) => {
  if (options && typeof options.margin === 'number' && options.margin >= 0) {
    return Math.floor(options.margin);
  }
  return DEFAULT_MARGIN;
};

const resolveTargetSize = (options) => {
  if (options && typeof options.width === 'number' && options.width > 0) {
    return Math.floor(options.width);
  }
  return null;
};

const renderToCanvas = (canvas, matrix, options = {}) => {
  const margin = resolveMargin(options);
  const moduleCount = matrix.length;
  const totalModules = moduleCount + margin * 2;
  const targetSize = resolveTargetSize(options);
  const scale = resolveScale(totalModules, options, targetSize);
  const baseSize = totalModules * scale;

  const workCanvas = document.createElement('canvas');
  workCanvas.width = baseSize;
  workCanvas.height = baseSize;
  const workCtx = workCanvas.getContext('2d');
  if (!workCtx) {
    throw new Error('Unable to access drawing context.');
  }

  const lightColor = options.color?.light ?? '#ffffff';
  const darkColor = options.color?.dark ?? '#000000';

  workCtx.fillStyle = lightColor;
  workCtx.fillRect(0, 0, baseSize, baseSize);

  workCtx.fillStyle = darkColor;
  for (let y = 0; y < moduleCount; y += 1) {
    for (let x = 0; x < moduleCount; x += 1) {
      if (!matrix[y][x]) {
        continue;
      }
      const px = (margin + x) * scale;
      const py = (margin + y) * scale;
      workCtx.fillRect(px, py, scale, scale);
    }
  }

  const finalCanvas = ensureCanvas(canvas);
  const outputSize = targetSize ?? baseSize;
  finalCanvas.width = outputSize;
  finalCanvas.height = outputSize;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) {
    throw new Error('Unable to access drawing context.');
  }
  finalCtx.imageSmoothingEnabled = false;
  finalCtx.clearRect(0, 0, outputSize, outputSize);
  finalCtx.drawImage(workCanvas, 0, 0, baseSize, baseSize, 0, 0, outputSize, outputSize);
};

const toCanvas = (canvas, value, options) => {
  return new Promise((resolve, reject) => {
    try {
      if (typeof document === 'undefined') {
        throw new Error('QR code generation requires a DOM environment.');
      }
      const matrix = generateMatrix(String(value ?? ''));
      renderToCanvas(canvas, matrix, options);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

const toDataURL = (value, options) => {
  return new Promise((resolve, reject) => {
    try {
      if (typeof document === 'undefined') {
        throw new Error('QR code generation requires a DOM environment.');
      }
      const canvas = document.createElement('canvas');
      const matrix = generateMatrix(String(value ?? ''));
      renderToCanvas(canvas, matrix, options);
      resolve(canvas.toDataURL('image/png'));
    } catch (error) {
      reject(error);
    }
  });
};

export { toCanvas, toDataURL };

export default {
  toCanvas,
  toDataURL,
};
