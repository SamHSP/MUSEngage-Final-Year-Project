export type QRCodeColor = {
  dark?: string;
  light?: string;
};

export type QRCodeRenderOptions = {
  margin?: number;
  scale?: number;
  width?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: QRCodeColor;
};

export declare function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options?: QRCodeRenderOptions
): Promise<void>;

export declare function toDataURL(
  text: string,
  options?: QRCodeRenderOptions
): Promise<string>;

declare const QRCode: {
  toCanvas: typeof toCanvas;
  toDataURL: typeof toDataURL;
};

export default QRCode;
