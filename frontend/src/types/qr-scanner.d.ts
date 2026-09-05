declare module 'qr-scanner' {
  export type QrScannerResult = { data: string };

  export type QrScannerOptions = {
    preferredCamera?: 'environment' | 'user';
    onDecodeError?: (error: Error) => void;
    scanInterval?: number;
  };

  export default class QrScanner {
    static WORKER_PATH: string;

    constructor(
      video: HTMLVideoElement,
      onDecode: (result: QrScannerResult) => void,
      options?: QrScannerOptions | undefined,
    );

    start(): Promise<void>;
    stop(): Promise<void>;
    destroy(): void;

    static hasCamera(): Promise<boolean>;
  }
}
