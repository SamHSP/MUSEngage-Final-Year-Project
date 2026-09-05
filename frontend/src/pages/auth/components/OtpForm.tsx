import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import apiClient from '../../../lib/apiClient';
import { useAuth } from '../../../context/AuthContext';
import type { User } from '../../../context/AuthContext';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
const API: string = import.meta.env.VITE_BACKEND_API;

type OTPProps = {
  email: string;
  requestOnMount?: boolean;
};

// Handles OTP verification for sign-in flows.
function OTP({ email, requestOnMount = true }: OTPProps) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState<number>(300);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const didRequest = useRef(false);

  type OTPVerifyResponse = {
    ok: boolean;
    user: User | null;
  };

  // Requests a fresh OTP from the server.
  const requestOtp = useCallback(async () => {
    try {
      await apiClient.post(`${API}/api/otp/request`, { email: email.trim() });
      setSeconds(300);
      setError(null);
    } catch (err) {
      console.error('OTP request failed:', err);
      setError('Failed to request OTP. Please try again.');
    }
  }, [email]);

  useEffect(() => {
    if (requestOnMount && !didRequest.current) {
      void requestOtp();
      didRequest.current = true;
    }
  }, [requestOnMount, requestOtp]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (seconds === 0) {
      alert('OTP expired. Returning to login page.');
      navigate('/login', { replace: true });
    }
  }, [seconds, navigate]);

  // Validates the OTP and completes sign-in.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) {
      setError('OTP is required.');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiClient.post<OTPVerifyResponse>(`${API}/api/otp/verify`, {
        email: email.trim(),
        code: otp.trim(),
      });

      if (response.data.ok) {
        const verifiedUser = response.data.user;
        if (verifiedUser) {
          setUser(verifiedUser);
        }

        const redirectPath = verifiedUser?.role === 'guest' ? '/events' : '/dashboard';
        const redirectMessage =
          verifiedUser?.role === 'guest'
            ? 'OTP verified! Redirecting to events…'
            : 'OTP verified successfully! Redirecting…';

        setSuccess(redirectMessage);
        await new Promise((resolve) => {
          window.setTimeout(resolve, 1800);
        });
        navigate(redirectPath, { replace: true });
      } else {
        setError('Invalid OTP. Redirecting to login…');
        window.setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1500);
      }
    } catch (err) {
      console.error('OTP verification failed:', err);
      if (isAxiosError(err) && err.response) {
        const detail = (err.response.data as { detail?: unknown } | undefined)?.detail;
        const detailMessage = typeof detail === 'string' ? detail : null;
        if (err.response.status === 401) {
          setError(detailMessage ?? 'Invalid or expired OTP. Redirecting to login…');
          window.setTimeout(() => {
            navigate('/login', { replace: true });
          }, 1500);
        } else if (err.response.status === 403) {
          setError(detailMessage ?? 'Please verify your email before logging in.');
        } else if (err.response.status === 423) {
          setError(detailMessage ?? 'Your account is locked due to repeated failures.');
        } else {
          setError(detailMessage ?? 'Unable to verify OTP. Please try again.');
        }
      } else {
        setError('Unable to verify OTP. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Stack spacing={3} alignItems="center" textAlign="center">
      <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">
          Secure Login
        </Typography>
        <Typography variant="h3">OTP Verification</Typography>
        <Typography variant="body1" color="text.secondary">
          We sent a code to {email}.
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
          <AccessTimeIcon color="warning" />
          <Typography variant="body2" color="text.secondary">
            Remaining time: {seconds}s
          </Typography>
        </Stack>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? (
        <Alert icon={<CheckCircleIcon fontSize="inherit" color="success" />} severity="success">
          {success}
        </Alert>
      ) : null}

      <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
        <Stack spacing={2}>
          <TextField
            id="otp-input"
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            inputProps={{
              maxLength: 8,
              style: { letterSpacing: '0.3em', textAlign: 'center', fontWeight: 600 },
            }}
            required
            label="Enter OTP"
          />
          <Button type="submit" variant="contained" size="large" disabled={isVerifying}>
            Verify OTP
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

export default OTP;
