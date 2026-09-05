export {};

declare global {
  type BarcodeFormat =
    | 'aztec'
    | 'code_128'
    | 'code_39'
    | 'code_93'
    | 'codabar'
    | 'data_matrix'
    | 'ean_13'
    | 'ean_8'
    | 'itf'
    | 'pdf417'
    | 'qr_code'
    | 'upc_a'
    | 'upc_e';

  interface BarcodeDetectorOptions {
    formats?: BarcodeFormat[];
  }

  interface BarcodeDetection {
    boundingBox: DOMRectReadOnly;
    cornerPoints: ReadonlyArray<DOMPointReadOnly>;
    format: BarcodeFormat;
    rawValue: string;
  }

  interface BarcodeDetector {
    detect(source: CanvasImageSource): Promise<BarcodeDetection[]>;
  }

  type BarcodeDetectorConstructor = {
    prototype: BarcodeDetector;
    new (options?: BarcodeDetectorOptions): BarcodeDetector;
    getSupportedFormats(): Promise<BarcodeFormat[]>;
  };

  var BarcodeDetector: BarcodeDetectorConstructor;

  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}
