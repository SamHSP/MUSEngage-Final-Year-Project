export interface QrScannerResult {
  data: string;
}

export interface QrScannerOptions {
  scanInterval?: number;
  onDecodeError?: (error: Error) => void;
}

export default class QrScanner {
  static WORKER_PATH: string | null;
  static hasCamera(): Promise<boolean>;
  constructor(video: HTMLVideoElement, onDecode: (result: QrScannerResult) => void, options?: QrScannerOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): void;
}

export { QrScanner };
