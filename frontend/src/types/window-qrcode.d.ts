export {};

declare global {
  interface Window {
    QRCode?: {
      toCanvas:
        | ((
            canvas: HTMLCanvasElement,
            text: string,
            options?: {
              margin?: number;
              width?: number;
              errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
              color?: {
                dark?: string;
                light?: string;
              };
            },
            callback?: (error: unknown | null) => void,
          ) => Promise<void> | void)
        | undefined;
      toDataURL: (
        text: string,
        options?: {
          margin?: number;
          width?: number;
          errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
          color?: {
            dark?: string;
            light?: string;
          };
        },
        callback?: (error: unknown | null, url?: string) => void,
      ) => Promise<string> | void;
    };
  }
}
