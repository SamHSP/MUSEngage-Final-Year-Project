import type { CSSProperties, ComponentType, ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';

export interface ScannerComponents {
  ViewFinder?: ComponentType<{ style?: CSSProperties }> | null;
}

export interface ScannerStyles {
  container?: CSSProperties;
  video?: CSSProperties;
  finder?: CSSProperties;
}

export interface QrScannerHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
}

export interface QrScannerProps extends HTMLAttributes<HTMLDivElement> {
  onDecode?: (text: string) => void;
  onResult?: (result: unknown) => void;
  onError?: (error: Error) => void;
  scanDelay?: number;
  constraints?: MediaTrackConstraints;
  paused?: boolean;
  styles?: ScannerStyles;
  containerStyle?: CSSProperties;
  videoStyle?: CSSProperties;
  ViewFinder?: ComponentType<{ style?: CSSProperties }> | null;
  components?: ScannerComponents;
}

export declare const QrScanner: ForwardRefExoticComponent<QrScannerProps & RefAttributes<QrScannerHandle>>;

export default QrScanner;
