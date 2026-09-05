import { useState } from 'react';
import axios, { isAxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Backdrop,
  Button,
  CircularProgress,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import LockIcon from '@mui/icons-material/Lock';
import { usePrivacyConsent } from '../../../hooks/usePrivacyConsent';

const API: string = import.meta.env.VITE_BACKEND_API;

// Presents the login form and handles OTP initiation.
function Login() {
  const [userEmail, setEmail] = useState<string>('');
  const [userPass, setPass] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string>('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const navigate = useNavigate();
  const hasPrivacyConsent = usePrivacyConsent();

  // Checks if an account exists for the given email.
  async function userExist(email: string): Promise<boolean> {
    const exist: AxiosResponse<boolean> = await axios.post(`${API}/api/users/validate`, { email: email.trim() });
    return exist.data;
  }

  // Validates the provided credentials against the backend.
  async function check_credentials(email: string, password: string) {
    const result = await axios.post<boolean>(`${API}/api/users/check_credentials`, {
      email: email.trim(),
      password: password,
    });
    return result.data;
  }

  // Requests a one-time password for the given email.
  async function requestOtp(email: string) {
    await axios.post(`${API}/api/otp/request`, { email: email.trim() });
  }

  // Submits login credentials and navigates to OTP verification.
  async function submitData(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedEmail = userEmail.trim().toLowerCase();
    setErrorMessage(null);
    setResendMessage(null);
    setShowResendVerification(false);
    setVerificationEmail('');
    if (isEmpty(trimmedEmail, userPass)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const email_exist = await userExist(trimmedEmail);

      if (!email_exist) {
        setErrorMessage('User does not exist');
        return;
      }
      let validCredential = false;
      try {
        validCredential = await check_credentials(trimmedEmail, userPass);
      } catch (error) {
        if (isAxiosError(error) && error.response) {
          const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
          const detailMessage = typeof detail === 'string' ? detail : null;
          if (error.response.status === 403) {
            setErrorMessage(detailMessage ?? 'Please verify your email before logging in.');
            setShowResendVerification(true);
            setVerificationEmail(trimmedEmail);
            return;
          }
          if (error.response.status === 423) {
            setErrorMessage(detailMessage ?? 'Your account is temporarily locked due to failed attempts.');
            return;
          }
          setErrorMessage(detailMessage ?? 'Unable to process login at the moment. Please try again.');
          return;
        }
        throw error;
      }

      if (!validCredential) {
        setErrorMessage('Invalid password');
        return;
      }

      await requestOtp(trimmedEmail);
      navigate('/otp', {
        state: { email: trimmedEmail, requestOtp: false },
      });
      setEmail('');
      setPass('');
    } catch (error) {
      console.error('Failed to validate credentials:', error);
      setErrorMessage('Unable to process login at the moment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Prefills guest credentials in the form.
  function handleGuestLogin() {
    setErrorMessage(null);
    setGuestEmail((prev) => {
      const trimmed = userEmail.trim();
      return trimmed !== '' ? trimmed : prev;
    });
    setShowGuestPrompt(true);
  }

  // Requests an OTP for a guest email address.
  async function submitGuestLogin(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setErrorMessage(null);
    const trimmedValue = guestEmail.trim();

    if (trimmedValue === '') {
      setErrorMessage('Email Address Required');
      return;
    }

    if (!trimmedValue.includes('@')) {
      setErrorMessage('Please enter your full Murdoch email address so we can send the OTP.');
      return;
    }

    try {
      setIsSubmitting(true);
      const normalizedEmail = trimmedValue.toLowerCase();
      setEmail(normalizedEmail);
      setGuestEmail(normalizedEmail);
      await requestOtp(trimmedValue);
      navigate('/otp', {
        state: { email: trimmedValue, requestOtp: false, mode: 'guest' },
      });
      setShowGuestPrompt(false);
    } catch (error) {
      console.error('Failed to request guest OTP:', error);
      setErrorMessage('Unable to request OTP for guest login. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification(): Promise<void> {
    if (!verificationEmail) {
      return;
    }
    setResendMessage(null);
    try {
      setIsResendingVerification(true);
      await axios.post(`${API}/api/auth/resend-verification`, { email: verificationEmail });
      setResendMessage('Verification email sent. Please check your inbox.');
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      if (isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
        const detail = (error.response.data as { detail?: unknown }).detail;
        if (typeof detail === 'string') {
          setResendMessage(detail);
        } else {
          setResendMessage('Unable to resend verification email. Please try again later.');
        }
      } else {
        setResendMessage('Unable to resend verification email. Please try again later.');
      }
    } finally {
      setIsResendingVerification(false);
    }
  }

  // Validates that both email and password fields have values.
  function isEmpty(email: string, password: string) {
    let emailIsEmpty = false;
    let passIsEmpty = false;

    if (email.trim() === '') {
      emailIsEmpty = true;
    }

    if (password.trim() === '') {
      passIsEmpty = true;
    }

    if (emailIsEmpty && passIsEmpty) {
      setErrorMessage('Email and Password Required');
      return true;
    }
    if (emailIsEmpty) {
      setErrorMessage('Email Address Required');
      return true;
    }
    if (passIsEmpty) {
      setErrorMessage('Password Required');
      return true;
    }

    return false;
  }

  return (
    <>
      <Backdrop
        open={isSubmitting || isResendingVerification}
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      <Stack spacing={3}>
        <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">
          Welcome back
        </Typography>
        <Typography variant="h3">Login</Typography>
        <Typography variant="body1" color="text.secondary">
          Enter your Murdoch credentials to request a one-time passcode.
        </Typography>
      </Stack>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        {showResendVerification ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Didn&apos;t receive the verification email? Request a new one below.
            </Typography>
            <Button
              variant="outlined"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
            >
              {isResendingVerification ? 'Sending…' : 'Resend verification email'}
            </Button>
            {resendMessage ? <Alert severity="info">{resendMessage}</Alert> : null}
          </Stack>
        ) : null}
        {!showResendVerification && resendMessage ? <Alert severity="info">{resendMessage}</Alert> : null}
        {showGuestPrompt ? (
        <Alert
          severity="info"
          onClose={() => {
            if (!isSubmitting) {
              setShowGuestPrompt(false);
            }
          }}
          sx={{ alignItems: 'flex-start' }}
        >
          <Stack component="form" onSubmit={submitGuestLogin} spacing={2} width="100%">
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" fontWeight={600}>
                Guest OTP request
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enter your Murdoch email address and we&apos;ll send a one-time passcode for guest access.
              </Typography>
            </Stack>
            <TextField
              required
              fullWidth
              type="email"
              label="Murdoch Email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              autoComplete="email"
              disabled={isSubmitting}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AlternateEmailIcon color="primary" />
                  </InputAdornment>
                ),
              }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                type="button"
                onClick={() => setShowGuestPrompt(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Send guest OTP
              </Button>
            </Stack>
          </Stack>
        </Alert>
        ) : null}
        <Stack component="form" onSubmit={submitData} spacing={2}>
          <TextField
            required
            fullWidth
            value={userEmail}
            id="Email"
            label="Murdoch Email"
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            disabled={isSubmitting}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AlternateEmailIcon color="primary" />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            required
            fullWidth
            type="password"
            value={userPass}
            id="Pass"
            label="Password"
            autoComplete="current-password"
            onChange={(e) => setPass(e.target.value)}
            variant="outlined"
            disabled={isSubmitting}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon color="primary" />
                </InputAdornment>
              ),
            }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button
              variant="contained"
              type="submit"
              size="large"
              endIcon={<LoginIcon />}
              disabled={isSubmitting}
            >
              Login
            </Button>
            <Button
              variant="outlined"
              type="button"
              size="large"
              disabled={isSubmitting || !hasPrivacyConsent}
              onClick={handleGuestLogin}
            >
              Guest Login
            </Button>
          </Stack>
        </Stack>
        <Typography variant="body2">
          Don&apos;t have an account?{' '}
          <Link component={RouterLink} to="/signup">
            Sign Up
          </Link>
        </Typography>
      </Stack>
    </>
  );
}

export default Login;
