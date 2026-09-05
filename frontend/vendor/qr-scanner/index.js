const isBrowser = typeof window !== 'undefined';
const hasBarcodeDetector = isBrowser && 'BarcodeDetector' in window;
const hasCreateImageBitmap = typeof createImageBitmap === 'function';

const createBarcodeDetector = () => {
  if (!hasBarcodeDetector) {
    return null;
  }

  try {
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch (error) {
    console.warn('Failed to create BarcodeDetector with QR filter', error);
  }

  try {
    return new window.BarcodeDetector();
  } catch (fallbackError) {
    console.warn('Failed to create BarcodeDetector without options', fallbackError);
    return null;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class QrScanner {
  static WORKER_PATH = null;

  static async hasCamera() {
    if (!isBrowser || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return false;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === 'videoinput');
    } catch (error) {
      console.warn('Failed to enumerate media devices', error);
      return false;
    }
  }

  constructor(video, onDecode, options = {}) {
    if (!video) {
      throw new Error('QrScanner requires a video element.');
    }
    this._video = video;
    this._onDecode = onDecode;
    this._onDecodeError = options.onDecodeError ?? null;
    this._scanInterval = Math.max(100, options.scanInterval ?? 400);
    this._active = false;
    this._stopped = false;
    this._stream = null;
    this._timeoutId = null;
    this._detector = createBarcodeDetector();
    this._lastResult = null;
    this._canvas = null;
    this._context = null;

    if (isBrowser) {
      this._video.playsInline = true;
      this._video.muted = true;
      this._video.autoplay = true;
      if (!this._video.hasAttribute('playsinline')) {
        this._video.setAttribute('playsinline', 'true');
      }
      if (!this._video.hasAttribute('muted')) {
        this._video.setAttribute('muted', 'true');
      }
      if (!this._video.hasAttribute('autoplay')) {
        this._video.setAttribute('autoplay', 'true');
      }
    }
  }

  async start() {
    if (!isBrowser) {
      throw new Error('Camera access is only available in the browser.');
    }
    if (this._active) {
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported in this browser.');
    }
    this._stopped = false;
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
      });
    } catch (error) {
      throw new Error(error?.message ?? 'Unable to access the camera.');
    }

    this._video.srcObject = this._stream;
    await this._video.play();
    this._active = true;
    this._lastResult = null;
    this._scanLoop().catch((error) => {
      if (this._onDecodeError) {
        this._onDecodeError(error);
      } else {
        console.warn('QR scan failed', error);
      }
    });
  }

  async stop() {
    this._stopped = true;
    this._active = false;
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._video && this._video.srcObject instanceof MediaStream) {
      this._video.pause();
      this._video.srcObject.getTracks().forEach((track) => track.stop());
      this._video.srcObject = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }
  }

  destroy() {
    void this.stop();
    this._detector = null;
    this._canvas = null;
    this._context = null;
  }

  async _scanLoop() {
    while (this._active && !this._stopped) {
      try {
        const result = await this._scanFrame();
        if (result && result !== this._lastResult) {
          this._lastResult = result;
          this._onDecode?.({ data: result });
        }
      } catch (error) {
        if (this._onDecodeError) {
          this._onDecodeError(error);
        } else {
          console.warn('QR scan error', error);
        }
      }
      await wait(this._scanInterval);
    }
  }

  async _scanFrame() {
    if (!this._detector) {
      throw new Error('QR scanning is not supported in this browser.');
    }
    if (!this._video || this._video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }
    const width = this._video.videoWidth;
    const height = this._video.videoHeight;
    if (!width || !height) {
      return null;
    }

    try {
      const directDetections = await this._detector.detect(this._video);
      if (directDetections && directDetections.length > 0) {
        const match = directDetections.find((candidate) => {
          const value = candidate?.rawValue ?? candidate?.data;
          if (!value || typeof value !== 'string') {
            return false;
          }
          const format = candidate?.format ?? candidate?.rawFormat ?? '';
          return typeof format === 'string' ? format.toLowerCase().includes('qr') : true;
        });

        if (match) {
          const value = match.rawValue ?? match.data ?? '';
          return typeof value === 'string' ? value.trim() : '';
        }
      }
    } catch (error) {
      console.debug('Direct video detection failed, falling back to canvas', error);
    }

    if (!this._canvas) {
      this._canvas = document.createElement('canvas');
      this._context = this._canvas.getContext('2d', { willReadFrequently: true });
    }

    if (!this._context) {
      throw new Error('Unable to initialise the canvas for QR scanning.');
    }

    this._canvas.width = width;
    this._canvas.height = height;
    this._context.drawImage(this._video, 0, 0, width, height);

    const source = hasCreateImageBitmap ? await createImageBitmap(this._canvas) : this._canvas;
    try {
      const detections = await this._detector.detect(source);
      if (detections && detections.length > 0) {
        const detection = detections.find((candidate) => {
          const format = candidate?.format ?? candidate?.rawFormat ?? '';
          const value = candidate?.rawValue ?? candidate?.data ?? '';
          if (!value || typeof value !== 'string') {
            return false;
          }
          if (typeof format === 'string' && format.toLowerCase().includes('qr')) {
            return true;
          }
          return candidate?.rawValue != null;
        });

        if (detection) {
          const result = detection.rawValue ?? detection.data ?? '';
          return typeof result === 'string' ? result.trim() : '';
        }
      }
      return null;
    } finally {
      if (source && typeof source.close === 'function') {
        source.close();
      }
    }
  }
}

export default QrScanner;
export { QrScanner };
