import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
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
import { useAuth } from '../context/AuthContext';
import type { RewardRedemptionRecord } from '../types/rewards';

const API = import.meta.env.VITE_BACKEND_API;

type JsQrDecodeFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
  },
) => { data: string } | null;

type RewardRedemptionVerifyResponse = {
  ok: boolean;
  message: string;
  alreadyClaimed: boolean;
  redemption: RewardRedemptionRecord;
};

type VerificationState =
  | { status: 'idle' }
  | { status: 'loading'; token: string }
  | {
      status: 'success';
      token: string;
      message: string;
      alreadyClaimed: boolean;
      redemption: RewardRedemptionRecord;
    }
  | { status: 'error'; token: string; message: string };

const RewardScannerPage = () => {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
  const adminId = isAdmin && authUser ? authUser.id : null;

  const [manualToken, setManualToken] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>({ status: 'idle' });
  const lastScannedRef = useRef<{ token: string; at: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const jsQrDecoderRef = useRef<JsQrDecodeFn | null>(null);
  const jsQrLoaderRef = useRef<Promise<JsQrDecodeFn> | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const verificationRef = useRef<VerificationState>({ status: 'idle' });

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

  useEffect(() => {
    return () => {
      stopMediaStream();
    };
  }, [stopMediaStream]);

  useEffect(() => {
    verificationRef.current = verification;
  }, [verification]);

  const handleVerify = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setVerification({ status: 'error', token, message: 'Enter a reward token to verify.' });
        return;
      }

      if (!adminId) {
        setVerification({
          status: 'error',
          token: trimmed,
          message: 'Sign in as an admin to verify reward redemptions.',
        });
        return;
      }

      setVerification({ status: 'loading', token: trimmed });
      try {
        const { data } = await axios.post<RewardRedemptionVerifyResponse>(
          `${API}/api/rewards/redemptions/verify`,
          {
            adminId,
            token: trimmed,
          },
        );
        setVerification({
          status: 'success',
          token: trimmed,
          message: data.message,
          alreadyClaimed: data.alreadyClaimed,
          redemption: data.redemption,
        });
      } catch (error) {
        console.error('Failed to verify reward token', error);
        if (axios.isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          setVerification({
            status: 'error',
            token: trimmed,
            message:
              typeof detail === 'string' && detail.trim()
                ? detail
                : 'Unable to verify this reward token. Try again.',
          });
        } else {
          setVerification({
            status: 'error',
            token: trimmed,
            message: 'Unable to verify this reward token. Try again.',
          });
        }
      }
    },
    [adminId],
  );

  const handleDecode = useCallback(
    (value: string | null) => {
      const token = value?.trim();
      if (!token) {
        return;
      }

      const last = lastScannedRef.current;
      const now = Date.now();
      if (last && last.token === token && now - last.at < 2000) {
        return;
      }

      lastScannedRef.current = { token, at: now };
      setManualToken(token);
      void handleVerify(token);
    },
    [handleVerify],
  );

  const handleScan = useCallback(
    (value: string | null) => {
      if (!value || verificationRef.current.status === 'loading') {
        return;
      }
      handleDecode(value);
    },
    [handleDecode],
  );

  const submitManualToken = useCallback(() => {
    const trimmed = manualToken.trim();
    if (!trimmed) {
      setVerification({ status: 'error', token: '', message: 'Enter a reward token to verify.' });
      return;
    }
    lastScannedRef.current = { token: trimmed, at: Date.now() };
    void handleVerify(trimmed);
  }, [handleVerify, manualToken]);

  const handleManualSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitManualToken();
    },
    [submitManualToken],
  );

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }

    const element = videoRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available on this device. Use manual entry instead.');
      return;
    }

    setCameraError(null);

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
            console.error('Failed to detect reward QR code', err);
          }

          frameRequestRef.current = requestAnimationFrame(detect);
        };

        frameRequestRef.current = requestAnimationFrame(detect);
      } catch (err) {
        console.error('Failed to initialise reward QR scanner', err);
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to access the camera. Please check permissions or enter the token manually.';
        setCameraError(message);
        stopMediaStream();
      }
    };

    void initialiseScanner();

    return () => {
      cancelled = true;
      stopMediaStream();
    };
  }, [ensureJsQrDecoder, handleScan, stopMediaStream]);

  const verificationAlert = useMemo(() => {
    if (verification.status === 'success') {
      return (
        <Alert severity={verification.alreadyClaimed ? 'info' : 'success'}>{verification.message}</Alert>
      );
    }
    if (verification.status === 'error') {
      return <Alert severity="error">{verification.message}</Alert>;
    }
    if (verification.status === 'loading') {
      return <Alert severity="info">Verifying token…</Alert>;
    }
    return null;
  }, [verification]);

  return (
    <Box sx={{ pb: 6 }}>
      <Seo
        title="QR Scanner — MUSEngage"
        description="Scan event and reward QR codes securely in your browser."
        canonical="https://musengage.site/reward-scanner"
        noindex
      />
      <PageHero
        title="Reward QR scanner"
        description="Scan reward QR codes to verify and mark redemptions."
        ctaLabel="Back to admin dashboard"
        ctaHref="/admin"
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
                  aria-label="Camera preview for scanning reward QR codes"
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
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={() => {
                        setCameraError(null);
                      }}
                    >
                      Dismiss
                    </Button>
                  </Box>
                ) : null}
              </Box>
            </Paper>
            <Stack spacing={2} flex={{ xs: 1, lg: 0.9 }}>
              <Typography variant="h4">Verify rewards instantly</Typography>
              <Typography variant="body1" color="text.secondary">
                Hold the attendee&apos;s reward QR code up to your camera. Verified tokens automatically
                mark the redemption as claimed.
              </Typography>
              {!adminId ? (
                <Alert severity="warning">
                  You must be signed in as an admin to mark reward redemptions as claimed.
                </Alert>
              ) : null}
              <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
                <Stack component="form" spacing={2} onSubmit={handleManualSubmit}>
                  <Typography variant="subtitle1">Enter a token manually</Typography>
                  <Typography variant="body2" color="text.secondary">
                    If scanning fails, type or paste the reward token here and verify it manually.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }}>
                    <TextField
                      label="Reward token"
                      value={manualToken}
                      onChange={(event) => setManualToken(event.target.value)}
                      fullWidth
                      autoComplete="off"
                    />
                    <Button
                      variant="contained"
                      type="submit"
                      disabled={verification.status === 'loading'}
                    >
                      Verify token
                    </Button>
                  </Stack>
                  {verificationAlert}
                </Stack>
              </Paper>
            </Stack>
          </Stack>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h6">Tips for successful scanning</Typography>
              <List sx={{ m: 0, p: 0 }}>
                <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 36, pt: '4px' }}>
                    <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Allow camera access"
                    secondary="Grant permission to use your camera and hold the QR code steady until it registers."
                  />
                </ListItem>
                <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 36, pt: '4px' }}>
                    <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Use manual fallback"
                    secondary="If the scan doesn&apos;t trigger, enter the token manually to verify the redemption."
                  />
                </ListItem>
                <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                  <ListItemIcon sx={{ minWidth: 36, pt: '4px' }}>
                    <CheckCircleIcon color="success" aria-hidden="true" focusable="false" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Need to switch tasks?"
                    secondary={
                      <span>
                        Return to the{' '}
                        <Button component={RouterLink} to="/admin" size="small">
                          admin dashboard
                        </Button>{' '}
                        to manage other tools.
                      </span>
                    }
                  />
                </ListItem>
              </List>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
};

export default RewardScannerPage;
