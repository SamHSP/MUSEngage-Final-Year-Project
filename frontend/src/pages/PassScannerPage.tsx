import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import {
  Alert,
  Box,
  Button,
  Container,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Link as RouterLink } from 'react-router-dom';

import PageHero from '../components/PageHero';
import Seo from '../components/Seo';
import { PASS_IMPORT_ENDPOINT, parsePassCsv } from '../utils/passSessions';
import type { PassImportResponse } from '../utils/passSessions';
import apiClient from '../lib/apiClient';

type ImportStatus = { type: 'success' | 'error' | 'info'; message: string } | null;

type JsQrDecodeFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
  },
) => { data: string } | null;

// Provides QR scanning and CSV import for PASS session management.
function PassScannerPage() {
  const [manualCsv, setManualCsv] = useState('');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastResultRef = useRef('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const jsQrDecoderRef = useRef<JsQrDecodeFn | null>(null);
  const jsQrLoaderRef = useRef<Promise<JsQrDecodeFn> | null>(null);
  const frameRequestRef = useRef<number | null>(null);

  // Lazily loads the jsQR decoder and caches it for subsequent scans.
  const ensureJsQrDecoder = useCallback(async (): Promise<JsQrDecodeFn> => {
    if (jsQrDecoderRef.current) {
      return jsQrDecoderRef.current;
    }

    if (jsQrLoaderRef.current) {
      return jsQrLoaderRef.current;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('QR decoding is only supported in the browser.');
    }

    const existing = (window as typeof window & { jsQR?: JsQrDecodeFn }).jsQR;
    if (typeof existing === 'function') {
      jsQrDecoderRef.current = existing;
      return existing;
    }

    const loadPromise = new Promise<JsQrDecodeFn>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        const jsQRGlobal = (window as typeof window & { jsQR?: JsQrDecodeFn }).jsQR;
        if (typeof jsQRGlobal === 'function') {
          jsQrDecoderRef.current = jsQRGlobal;
          resolve(jsQRGlobal);
        } else {
          reject(new Error('QR decoder library failed to load.'));
        }
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('Unable to load the QR decoder library.'));
      };
      document.head.appendChild(script);
    });

    jsQrLoaderRef.current = loadPromise;

    try {
      return await loadPromise;
    } finally {
      if (jsQrLoaderRef.current === loadPromise) {
        jsQrLoaderRef.current = null;
      }
    }
  }, []);

  const stopMediaStream = useCallback(() => {
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    fallbackCanvasRef.current = null;
    fallbackContextRef.current = null;

    const element = videoRef.current;
    if (element) {
      element.pause();
      element.srcObject = null;
    }
  }, []);

  const checkCameraAvailability = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return {
        ok: false,
        message: 'Camera access is not supported in this browser. Use the manual entry option instead.',
      } as const;
    }

    if (typeof window !== 'undefined' && !(window as typeof window & { BarcodeDetector?: unknown }).BarcodeDetector) {
      try {
        await import('qr-scanner');
      } catch (err) {
        console.error('Failed to load fallback QR scanner', err);
        return {
          ok: false,
          message: 'QR scanning is not supported in this browser. Use the manual entry option instead.',
        } as const;
      }
    }

    if (!navigator.mediaDevices.enumerateDevices) {
      return { ok: true, message: null } as const;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some((device) => device.kind === 'videoinput');
      if (!hasCamera) {
        return {
          ok: false,
          message: 'No camera detected. Connect a camera or use the manual entry option.',
        } as const;
      }
      return { ok: true, message: null } as const;
    } catch (err) {
      console.error('Failed to access camera devices', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to access the camera. Please check your permissions and try again.';
      return { ok: false, message } as const;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updateCameraStatus = async () => {
      const result = await checkCameraAvailability();
      if (cancelled) {
        return;
      }
      setCameraAvailable(result.ok);
      setCameraError(result.ok ? null : result.message);
    };

    void updateCameraStatus();

    return () => {
      cancelled = true;
    };
  }, [checkCameraAvailability]);

  useEffect(() => stopMediaStream, [stopMediaStream]);

  const processCsv = useCallback(
    async (rawValue: string, { fromScan = false }: { fromScan?: boolean } = {}) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setStatus({ type: 'error', message: 'We could not detect any PASS sessions in the scanned code.' });
        return false;
      }

      if (fromScan && trimmed === lastResultRef.current) {
        return false;
      }

      lastResultRef.current = trimmed;
      setLastScan(trimmed);
      if (fromScan) {
        setManualCsv(trimmed);
      }
      setStatus(null);

      const parsed = parsePassCsv(trimmed);
      if (parsed.length === 0) {
        setStatus({ type: 'error', message: 'We could not detect any PASS sessions in the scanned code.' });
        return false;
      }

      setIsProcessing(true);
      try {
        const { data } = await apiClient.post<PassImportResponse | Partial<PassImportResponse> | null>(
          PASS_IMPORT_ENDPOINT,
          { sessions: parsed },
        );
        const addedCount = Array.isArray(data?.added) ? data.added.length : 0;
        const duplicateCount = typeof data?.duplicateCount === 'number' ? data.duplicateCount : 0;

        if (addedCount === 0) {
          const message =
            duplicateCount > 0
              ? 'All sessions in the QR code are already saved.'
              : 'No PASS sessions were imported from the QR code.';
          setStatus({ type: 'info', message });
        } else {
          const duplicateMessage =
            duplicateCount > 0
              ? ` ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} skipped.`
              : '';
          setStatus({
            type: 'success',
            message: `Added ${addedCount} PASS session${addedCount > 1 ? 's' : ''} from the QR code.${duplicateMessage}`,
          });
        }

        return true;
      } catch (err) {
        console.error('Failed to import PASS sessions', err);
        if (isAxiosError(err)) {
          const detail = err.response?.data?.detail;
          if (err.response?.status === 403) {
            setStatus({
              type: 'error',
              message:
                typeof detail === 'string'
                  ? detail
                  : 'You do not have permission to import PASS sessions.',
            });
          } else if (typeof detail === 'string') {
            setStatus({ type: 'error', message: detail });
          } else {
            setStatus({
              type: 'error',
              message: 'We could not save the scanned PASS sessions. Please try again.',
            });
          }
        } else {
          setStatus({
            type: 'error',
            message: 'We could not save the scanned PASS sessions. Please try again.',
          });
        }
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  const handleScan = useCallback(
    (value: string | null) => {
      if (!value) {
        return;
      }
      void processCsv(value, { fromScan: true });
    },
    [processCsv],
  );

  const handleRetryCamera = useCallback(() => {
    setCameraError(null);
    setCameraAvailable(true);
    stopMediaStream();
    void (async () => {
      const result = await checkCameraAvailability();
      setCameraAvailable(result.ok);
      setCameraError(result.ok ? null : result.message);
    })();
  }, [checkCameraAvailability, stopMediaStream]);

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualCsv.trim()) {
      return;
    }
    void processCsv(manualCsv);
  };

  const handleClear = () => {
    lastResultRef.current = '';
    setManualCsv('');
    setLastScan(null);
    setStatus(null);
  };

  useEffect(() => {
    if (!cameraAvailable || cameraError) {
      stopMediaStream();
      return;
    }

    const element = videoRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    const initialiseScanner = async () => {
      try {
        const barcodeDetectorCtor = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;

        if (!barcodeDetectorCtor) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          });

          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          const jsQr = await ensureJsQrDecoder();

          mediaStreamRef.current = stream;
          element.srcObject = stream;
          element.setAttribute('playsinline', 'true');
          element.setAttribute('muted', 'true');
          element.muted = true;

          await element.play();

          let canvas = fallbackCanvasRef.current;
          if (!canvas) {
            canvas = document.createElement('canvas');
            fallbackCanvasRef.current = canvas;
          }

          let context = fallbackContextRef.current;
          if (!context) {
            context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) {
              throw new Error('Unable to access drawing surface for QR scanning.');
            }
            fallbackContextRef.current = context;
          }

          const detect = () => {
            if (cancelled) {
              return;
            }

            try {
              if (element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                const width = element.videoWidth;
                const height = element.videoHeight;
                if (width > 0 && height > 0) {
                  const activeCanvas = canvas;
                  const activeContext = context;
                  if (!activeCanvas || !activeContext) {
                    return;
                  }
                  activeCanvas.width = width;
                  activeCanvas.height = height;
                  activeContext.drawImage(element, 0, 0, width, height);
                  const imageData = activeContext.getImageData(0, 0, width, height);
                  const result = jsQr(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'attemptBoth',
                  });
                  if (result?.data) {
                    handleScan(result.data);
                  }
                }
              }
            } catch (err) {
              console.warn('Failed to process frame for QR detection', err);
            }

            frameRequestRef.current = requestAnimationFrame(detect);
          };

          setCameraAvailable(true);
          setCameraError(null);

          frameRequestRef.current = requestAnimationFrame(detect);
          return;
        }

        const detector = new barcodeDetectorCtor({ formats: ['qr_code'] });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        element.srcObject = stream;
        element.setAttribute('playsinline', 'true');

        await element.play();

        setCameraAvailable(true);
        setCameraError(null);

        const detect = async () => {
          if (cancelled) {
            return;
          }

          try {
            if (element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
              const barcodes = await detector.detect(element);
              if (barcodes.length > 0) {
                const [first] = barcodes;
                const rawValue = typeof first.rawValue === 'string' ? first.rawValue : '';
                handleScan(rawValue);
              }
            }
          } catch (err) {
            console.error('Failed to detect QR code', err);
          }

          frameRequestRef.current = requestAnimationFrame(detect);
        };

        frameRequestRef.current = requestAnimationFrame(detect);
      } catch (err) {
        console.error('Failed to initialise PASS QR scanner', err);
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to access the camera. Please check your permissions and try again.';
        setCameraError(message);
        setCameraAvailable(false);
        stopMediaStream();
      }
    };

    void initialiseScanner();

    return () => {
      cancelled = true;
      stopMediaStream();
    };
  }, [cameraAvailable, cameraError, ensureJsQrDecoder, handleScan, stopMediaStream]);

  return (
    <Box sx={{ pb: 6 }}>
      <Seo
        title="QR Scanner — MUSEngage"
        description="Scan event and reward QR codes securely in your browser."
        canonical="https://musengage.site/pass-scanner"
        noindex
      />
      <PageHero
        title="PASS QR scanner"
        description="Scan the QR code provided by your facilitator to import upcoming PASS study sessions."
        ctaLabel="Back to dashboard"
        ctaHref="/dashboard"
      />
      <Container sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={4}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="stretch">
            <Paper
              variant="outlined"
              sx={{
                flex: 1,
                p: { xs: 2, sm: 3 },
                bgcolor: 'grey.900',
                color: 'common.white',
                borderRadius: 3,
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'black',
                  aspectRatio: '4 / 3',
                }}
              >
                <Box
                  component="video"
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  role="img"
                  aria-label="Camera preview for scanning PASS QR codes"
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: cameraError ? 0 : 1,
                    transition: 'opacity 200ms ease',
                  }}
                />
                {cameraError ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      bgcolor: 'rgba(15, 15, 15, 0.88)',
                      color: 'error.light',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 3,
                      textAlign: 'center',
                      gap: 1.5,
                    }}
                  >
                    <Typography variant="subtitle1">{cameraError}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Camera access or browser support is required to continue scanning.
                    </Typography>
                    <Button variant="outlined" color="inherit" onClick={handleRetryCamera}>
                      Try camera again
                    </Button>
                  </Box>
                ) : null}
                {lastScan && !cameraError ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 16,
                      right: 16,
                      bottom: 16,
                      bgcolor: 'rgba(0, 0, 0, 0.7)',
                      color: 'common.white',
                      p: 2,
                      borderRadius: 1,
                      boxShadow: 6,
                    }}
                  >
                    <Typography variant="overline" sx={{ color: 'secondary.light' }}>
                      Last scanned PASS data
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                      {lastScan}
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            </Paper>
            <Stack spacing={2} flex={{ xs: 1, lg: 0.9 }}>
              <Typography variant="h4">Import study sessions instantly</Typography>
              <Typography variant="body1" color="text.secondary">
                Scan the PASS QR code handed out during your lecture or tutorial. We will add every listed study session to your
                dashboard once the code is processed.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                If scanning is not available, paste the CSV data provided by your facilitator. Each row should include the meeting
                time, student lecturer, venue, and Google Meet link.
              </Typography>
              <Stack component="form" spacing={1.5} onSubmit={handleManualSubmit}>
                <TextField
                  label="Paste PASS CSV data"
                  multiline
                  minRows={3}
                  value={manualCsv}
                  onChange={(event) => setManualCsv(event.target.value)}
                  placeholder={'Meeting time, Student Lecturer, Venue, Google Meet link\n...'}
                  fullWidth
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button type="submit" variant="contained" disabled={!manualCsv.trim() || isProcessing}>
                    Import sessions
                  </Button>
                  <Button variant="outlined" color="secondary" onClick={handleClear} disabled={!manualCsv && !lastScan}>
                    Clear
                  </Button>
                </Stack>
              </Stack>
              {isProcessing ? <Alert severity="info">Processing scanned PASS sessions…</Alert> : null}
              {status ? (
                <Alert severity={status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : 'info'}>
                  {status.message}
                </Alert>
              ) : null}
              {cameraError && !cameraAvailable ? <Alert severity="warning">{cameraError}</Alert> : null}
            </Stack>
          </Stack>

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Tips for a smooth scan
            </Typography>
            <List>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Grant camera permissions when prompted." />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Hold the QR code steady in good lighting for best results." />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Imported sessions appear on your dashboard immediately." />
              </ListItem>
            </List>
          </Paper>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
            <Button component={RouterLink} to="/dashboard" variant="outlined">
              Return to dashboard
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default PassScannerPage;
