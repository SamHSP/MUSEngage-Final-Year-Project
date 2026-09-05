import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import QrScannerLib from 'qr-scanner';
import workerUrl from 'qr-scanner/qr-scanner-worker.min.js?url';

if (!QrScannerLib.WORKER_PATH) {
  QrScannerLib.WORKER_PATH = workerUrl;
}

const normaliseError = (error) => {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('An unknown QR scanner error occurred.');
};

const extractFacingMode = (constraints) => {
  if (!constraints || !constraints.facingMode) {
    return undefined;
  }
  const { facingMode } = constraints;
  if (typeof facingMode === 'string') {
    return facingMode;
  }
  if (Array.isArray(facingMode)) {
    return facingMode.find((mode) => typeof mode === 'string') ?? undefined;
  }
  if (typeof facingMode === 'object') {
    const { exact, ideal } = facingMode;
    if (typeof exact === 'string') {
      return exact;
    }
    if (Array.isArray(exact)) {
      const value = exact.find((mode) => typeof mode === 'string');
      if (value) {
        return value;
      }
    }
    if (typeof ideal === 'string') {
      return ideal;
    }
    if (Array.isArray(ideal)) {
      const value = ideal.find((mode) => typeof mode === 'string');
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const getContainerStyle = (style, styles, containerStyle) => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  ...(styles && styles.container ? styles.container : {}),
  ...(style || {}),
  ...(containerStyle || {}),
});

const getVideoStyle = (styles, videoStyle) => ({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  ...(styles && styles.video ? styles.video : {}),
  ...(videoStyle || {}),
});

const getFinderStyle = (styles) => ({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  ...(styles && styles.finder ? styles.finder : {}),
});

const QrScanner = forwardRef(function QrScanner(
  {
    onDecode,
    onResult,
    onError,
    scanDelay = 500,
    constraints,
    paused = false,
    className,
    style,
    styles,
    containerStyle,
    videoStyle,
    ViewFinder,
    components,
    ...rest
  },
  ref,
) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const startPromiseRef = useRef(null);
  const shouldPauseRef = useRef(Boolean(paused));
  const onDecodeRef = useRef(onDecode);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const stopScanner = useCallback(async () => {
    const startPromise = startPromiseRef.current;
    if (startPromise) {
      try {
        await startPromise;
      } catch (error) {
        if (onErrorRef.current) {
          onErrorRef.current(normaliseError(error));
        }
      }
      if (startPromiseRef.current === startPromise) {
        startPromiseRef.current = null;
      }
    }

    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      await scanner.stop();
    } catch (error) {
      if (onErrorRef.current) {
        onErrorRef.current(normaliseError(error));
      }
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (shouldPauseRef.current) {
      return;
    }

    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch (error) {
        if (onErrorRef.current) {
          onErrorRef.current(normaliseError(error));
        }
      }
      return;
    }

    const startPromise = scanner.start();
    startPromiseRef.current = startPromise;

    try {
      await startPromise;
    } catch (error) {
      if (onErrorRef.current) {
        onErrorRef.current(normaliseError(error));
      }
    } finally {
      if (startPromiseRef.current === startPromise) {
        startPromiseRef.current = null;
      }
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async start() {
        shouldPauseRef.current = false;
        await startScanner();
      },
      async stop() {
        shouldPauseRef.current = true;
        await stopScanner();
      },
      async pause() {
        shouldPauseRef.current = true;
        await stopScanner();
      },
      async resume() {
        shouldPauseRef.current = false;
        await startScanner();
      },
    }),
    [startScanner, stopScanner],
  );

  useEffect(() => {
    shouldPauseRef.current = Boolean(paused);
    if (shouldPauseRef.current) {
      void stopScanner();
    } else {
      void startScanner();
    }
  }, [paused, startScanner, stopScanner]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return undefined;
    }

    let cancelled = false;
    const scansPerSecond =
      typeof scanDelay === 'number' && scanDelay > 0 ? Math.max(1, Math.round(1000 / scanDelay)) : undefined;

    const options = {
      preferredCamera: extractFacingMode(constraints),
      maxScansPerSecond: scansPerSecond,
    };

    const scanner = new QrScannerLib(
      videoElement,
      (result) => {
        if (cancelled || shouldPauseRef.current) {
          return;
        }

        if (onResultRef.current) {
          onResultRef.current(result);
        }

        const text =
          typeof result === 'string'
            ? result
            : result && typeof result.data === 'string'
              ? result.data
              : result && typeof result.text === 'string'
                ? result.text
                : '';

        if (text && onDecodeRef.current) {
          onDecodeRef.current(text);
        }
      },
      options,
    );

    scannerRef.current = scanner;

    if (!shouldPauseRef.current) {
      void startScanner();
    }

    return () => {
      cancelled = true;
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }

      void (async () => {
        try {
          await scanner.stop();
        } catch (error) {
          if (onErrorRef.current) {
            onErrorRef.current(normaliseError(error));
          }
        }
        scanner.destroy();
      })();
    };
  }, [constraints, scanDelay, startScanner, stopScanner]);

  const FinderComponent = (components && components.ViewFinder) || ViewFinder || null;
  const finderStyle = getFinderStyle(styles);

  return (
    <div
      {...rest}
      className={className}
      style={getContainerStyle(style, styles, containerStyle)}
    >
      <video
        ref={videoRef}
        style={getVideoStyle(styles, videoStyle)}
        muted
        playsInline
      />
      {FinderComponent ? <FinderComponent style={finderStyle} /> : null}
    </div>
  );
});

export { QrScanner };
export default QrScanner;
