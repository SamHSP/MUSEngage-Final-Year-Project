import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
// import type QrScanner from 'qr-scanner';
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
import PageHero from '../components/PageHero';
import Seo from '../components/Seo';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

type JsQrDecodeFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
  },
) => { data: string } | null;

const API = import.meta.env.VITE_BACKEND_API;

type ScanResult = { token: string; scannedAt: number };

type VerificationState =
  | { status: 'idle' }
  | { status: 'loading'; token: string }
  | { status: 'success'; token: string; message: string; eventTitle: string; rewardPointsAwarded: number; totalRewardPoints: number }
  | { status: 'already'; token: string; message: string; eventTitle: string; totalRewardPoints: number }
  | { status: 'error'; token: string; message: string };

type RsvpVerifyResponse = {
  ok: boolean;
  message: string;
  alreadyClaimed: boolean;
  rewardPointsAwarded: number;
  totalRewardPoints: number;
  event: {
    id: string;
    title: string;
    rsvp?: { reward_points?: number | null } | null;
  };
};

// Allows staff to scan QR codes or enter tokens to verify event attendance.
function QrScannerPage() {
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [manualToken, setManualToken] = useState('');
  const { user, setUser } = useAuth();
  const [verification, setVerification] = useState<VerificationState>({ status: 'idle' });
  const handledScanIdRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const jsQrDecoderRef = useRef<JsQrDecodeFn | null>(null);
  const jsQrLoaderRef = useRef<Promise<JsQrDecodeFn> | null>(null);
  const frameRequestRef = useRef<number | null>(null);

  // Loads the jsQR decoder script exactly once.
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
      } catch (error) {
        console.error('Failed to load fallback QR scanner', error);
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
    } catch (error) {
      console.error('Failed to access camera devices', error);
      const message =
        error instanceof Error
          ? error.message
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

  const handleScan = useCallback(
    (value: string | null) => {
      const token = value?.trim();
      if (!token) {
        return;
      }

      setManualToken(token);

      if (lastScan && lastScan.token === token && Date.now() - lastScan.scannedAt < 1500) {
        return;
      }

      setVerification({ status: 'idle' });
      setLastScan({ token, scannedAt: Date.now() });
      setCameraError(null);
      setCameraAvailable(true);
    },
    [lastScan],
  );

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
    const trimmed = manualToken.trim();
    if (!trimmed) {
      return;
    }
    setVerification({ status: 'idle' });
    setLastScan({ token: trimmed, scannedAt: Date.now() });
    setManualToken('');
    if (cameraAvailable) {
      setCameraError(null);
    }
  };

  useEffect(() => {
    if (!lastScan) {
      return;
    }

    if (handledScanIdRef.current === lastScan.scannedAt) {
      return;
    }

    const token = lastScan.token.trim();
    if (!token) {
      return;
    }

    handledScanIdRef.current = lastScan.scannedAt;

    if (!user) {
      setVerification({ status: 'error', token, message: 'Sign in to add reward points to your profile.' });
      return;
    }

    let cancelled = false;
    setVerification({ status: 'loading', token });

    void (async () => {
      try {
        const { data } = await axios.post<RsvpVerifyResponse>(`${API}/api/rsvp/verify`, {
          token,
          userId: user.id,
        });

        if (cancelled) {
          return;
        }

        const eventTitle = data.event?.title ?? 'Event';

        if (data.alreadyClaimed) {
          const alreadyMessage = `Attendance already confirmed for ${eventTitle}. No additional points were added.`;
          setVerification({
            status: 'already',
            token,
            message: alreadyMessage,
            eventTitle,
            totalRewardPoints: data.totalRewardPoints,
          });
          setUser({ ...user, rewardPoints: data.totalRewardPoints });
          return;
        }

        if (data.ok) {
          const successMessage =
            data.rewardPointsAwarded > 0
              ? `Attendance confirmed. Points awarded for ${eventTitle}.`
              : `Attendance confirmed for ${eventTitle}. This event does not award reward points.`;
          setVerification({
            status: 'success',
            token,
            message: successMessage,
            eventTitle,
            rewardPointsAwarded: data.rewardPointsAwarded,
            totalRewardPoints: data.totalRewardPoints,
          });
          setUser({ ...user, rewardPoints: data.totalRewardPoints });
          return;
        }

        setVerification({ status: 'error', token, message: data.message || 'Unable to verify the RSVP token.' });
      } catch (error) {
        if (cancelled) {
          return;
        }

        let message = 'Unable to verify the RSVP token. Please try again.';
        if (axios.isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          const status = error.response?.status;
          if (status === 404) {
            message = 'Invalid QR code detected. Present the event RSVP QR code to confirm attendance.';
          } else if (status === 400 && typeof detail === 'string' && detail.trim()) {
            message = detail;
          } else if (typeof detail === 'string' && detail.trim()) {
            message = detail;
          }
        }
        setVerification({ status: 'error', token, message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lastScan, setUser, user]);

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
        const barcodeDetectorCtor =
          typeof window !== 'undefined' ? window.BarcodeDetector : undefined;

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
            } catch (error) {
              console.warn('Failed to process frame for QR detection', error);
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
          } catch (error) {
            console.error('Failed to detect QR code', error);
          }

          frameRequestRef.current = requestAnimationFrame(detect);
        };

        frameRequestRef.current = requestAnimationFrame(detect);
      } catch (error) {
        console.error('Failed to initialise QR scanner', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to access the camera. Please check your permissions and try again.';
        setCameraError(message);
        setCameraAvailable(false);
      }
    };

    void initialiseScanner();

    return () => {
      cancelled = true;
      stopMediaStream();
    };
  }, [cameraAvailable, cameraError, ensureJsQrDecoder, handleScan, stopMediaStream]);

  return (
    <Box>
      <Seo
        title="QR Scanner — MUSEngage"
        description="Scan event and reward QR codes securely in your browser."
        canonical="https://musengage.site/qr"
        noindex
      />
      <PageHero
        eyebrow="QR Code Scanner"
        title="Scan event QR codes to earn reward points"
        description="Use the scanner to confirm your attendance at Murdoch University events in Singapore."
        theme="qr"
        ctaLabel="Back to dashboard"
        ctaHref="/dashboard"
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={4} direction={{ xs: 'column', md: 'row' }} alignItems="stretch">
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: 'secondary.main',
              p: { xs: 2, md: 3 },
              bgcolor: 'black',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: { xs: 320, md: 420 },
                overflow: 'hidden',
                borderRadius: 2,
                bgcolor: 'grey.900',
              }}
            >
              <Box
                component="video"
                ref={videoRef}
                autoPlay
                muted
                playsInline
                role="img"
                aria-label="Camera preview for scanning event QR codes"
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
              {lastScan ? (
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
                    Last scanned code
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                    {lastScan.token}
                  </Typography>
                </Box>
              ) : null}
            </Box>
          </Paper>
          <Stack spacing={2} flex={1}>
            <Typography variant="h4">Ready to scan?</Typography>
            <Typography variant="body1" color="text.secondary">
              Present the QR code provided at the event entrance. Once scanned, reward points will be applied to your profile.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The scanner uses your device camera to read QR codes instantly. Grant permissions when prompted and ensure the
              code is well lit for the fastest results.
            </Typography>
            <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1.5} onSubmit={handleManualSubmit}>
              <TextField
                label="Enter RSVP token"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Paste the RSVP key from the event host"
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={!manualToken.trim()}>
                Record token
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              If scanning is unavailable, ask the organiser for the RSVP key and enter it here to record the attendance code.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                onClick={() => {
                  setLastScan(null);
                  setVerification({ status: 'idle' });
                  handledScanIdRef.current = null;
                }}
                disabled={!lastScan}
              >
                Clear last scan
              </Button>
            </Stack>
            {verification.status === 'loading' ? (
              <Alert severity="info">Verifying attendance…</Alert>
            ) : null}
            {verification.status === 'success' ? (
              <Alert severity="success">
                {verification.message} Your updated balance is{' '}
                <strong>{verification.totalRewardPoints.toLocaleString()} reward points</strong>.
              </Alert>
            ) : null}
            {verification.status === 'already' ? (
              <Alert severity="info">
                {verification.message} You currently have{' '}
                <strong>{verification.totalRewardPoints.toLocaleString()} reward points</strong>.
              </Alert>
            ) : null}
            {verification.status === 'error' ? (
              <Alert severity="error">{verification.message}</Alert>
            ) : null}
            {cameraError && !cameraAvailable ? <Alert severity="warning">{cameraError}</Alert> : null}
            <List>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Ensure camera permissions are granted on your device." />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Scan event codes within 24 hours of the scheduled start time." />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                </ListItemIcon>
                <ListItemText primary="Reward points will reflect after successful verification." />
              </ListItem>
            </List>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default QrScannerPage;
