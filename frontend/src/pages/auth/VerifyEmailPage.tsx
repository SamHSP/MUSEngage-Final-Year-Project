import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import axios, { isAxiosError } from 'axios';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import { API_BASE } from '../../lib/apiClient';  // ← Use the same API_BASE
import type { AlertColor } from "@mui/material";

type VerificationStatus = 'idle' | 'pending' | 'success' | 'error';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Verification token missing. Please use the link from your email.');
      return;
    }

    setStatus('idle');
    setMessage('Click the button below to confirm your email address.');
  }, [token]);

  const verifyUrl = API_BASE ? `${API_BASE}/api/auth/verify-email` : '/api/auth/verify-email';  // ← Fix URL construction

  const handleVerify = useCallback(async () => {
    if (!token) {
      return;
    }

    setStatus('pending');
    setMessage('');

    try {
      const response = await axios.post(verifyUrl, { token });
      const detail = (response.data as { message?: string } | undefined)?.message;
      setMessage(detail ?? 'Email verified successfully.');
      setStatus('success');
    } catch (error) {
      console.error('Email verification error:', error);  // ← Add debug logging
      if (isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
        const detail = (error.response.data as { detail?: unknown }).detail;
        setMessage(typeof detail === 'string' ? detail : 'The verification link is invalid or has expired.');
      } else {
        setMessage('We were unable to verify your email. Please try again later.');
      }
      setStatus('error');
    }
  }, [token, verifyUrl]);

  const isLoading = status === 'pending';

  const alertSeverity: AlertColor = status === 'success' ? 'success' : status === 'error' ? 'error' : 'info';

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3} alignItems="stretch">
        <Typography variant="h3" component="h1" textAlign="center">
          Verify your email
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          Confirming your email helps us keep your account secure.
        </Typography>

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : message ? (
          <Alert severity={alertSeverity}>{message}</Alert>
        ) : null}

        {token ? (
          <Button
            variant="contained"
            onClick={handleVerify}
            disabled={isLoading || status === 'success'}
          >
            {isLoading ? 'Verifying…' : 'Verify email'}
          </Button>
        ) : null}

        {status === 'success' ? (
          <Button component={RouterLink} to="/login" variant="contained">
            Continue to login
          </Button>
        ) : null}
      </Stack>
    </Container>
  );
}

export default VerifyEmailPage;
