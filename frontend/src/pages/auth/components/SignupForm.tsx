import { type ReactNode, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import CheckIcon from '@mui/icons-material/Check';
// import UserDebug from './UserDebug';

const API: string = import.meta.env.VITE_BACKEND_API;

type SignupFormProps = {
  consentsAccepted?: boolean;
  onRequireConsents?: () => void;
  renderConsentFields?: (options: { disabled: boolean }) => ReactNode;
};

// Collects user details to create a new account.
function Signup({ consentsAccepted = true, onRequireConsents, renderConsentFields }: SignupFormProps) {
  const [userName, setName] = useState<string>('');
  const [userEmail, setEmail] = useState<string>('');
  const [userPass, setPass] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  // const [debugState, setDebugState] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Checks if a user already exists for the provided email.
  async function userExist(email: string): Promise<boolean> {
    const exist: AxiosResponse<boolean> = await axios.post(`${API}/api/users/validate`, { email: email.trim() });
    return exist.data;
  }

  // Sends the signup request to the backend.
  async function submitData(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!consentsAccepted) {
      setErrorMessage('You must agree to the Privacy Policy and Terms of Service to create an account.');
      onRequireConsents?.();
      return;
    }
    const isValid = await validateForm();
    if (!isValid) {
      return;
    }
    const userData = {
      name: userName,
      email: userEmail.trim().toLowerCase(),
      password: userPass,
    };

    try {
      setIsSubmitting(true);
      await axios.post(`${API}/api/auth/register`, userData);
      setSuccessMessage('Account created successfully! Please verify your email before logging in.');
      setName('');
      setEmail('');
      setPass('');
      setConfirmPass('');
    } catch (error) {
      console.error('Failed to create account', error);
      if (isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
        const detail = (error.response.data as { detail?: unknown }).detail;
        if (typeof detail === 'string') {
          setErrorMessage(detail);
        } else {
          setErrorMessage('We were unable to create your account. Please check the form and try again.');
        }
      } else {
        setErrorMessage('We were unable to create your account. Please try again later.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Validates the signup form inputs before submission.
  async function validateForm(): Promise<boolean> {
    const missingInfo: string[] = [];

    if (userEmail === '') {
      missingInfo.push('Email');
    }

    if (userName === '') {
      missingInfo.push('Username');
    }

    if (userPass === '') {
      missingInfo.push('Password');
    }

    if (missingInfo.length > 0) {
      setErrorMessage(`${missingInfo.join(', ')} ${missingInfo.length === 1 ? 'is' : 'are'} required.`);
      return false;
    }

    const trimmedEmail = userEmail.trim().toLowerCase();
    if (!/^\d{8}@student\.murdoch\.edu\.au$/.test(trimmedEmail)) {
      setErrorMessage('Please use your Murdoch University student email (format: 12345678@student.murdoch.edu.au).');
      return false;
    }

    if (userPass !== confirmPass) {
      setErrorMessage('Password does not match');
      return false;
    }

    if (userPass.length < 12) {
      setErrorMessage('Password must be at least 12 characters long.');
      return false;
    }
    if (!/[A-Z]/.test(userPass)) {
      setErrorMessage('Password must contain at least one uppercase letter.');
      return false;
    }
    if (!/[a-z]/.test(userPass)) {
      setErrorMessage('Password must contain at least one lowercase letter.');
      return false;
    }
    if (!/\d/.test(userPass)) {
      setErrorMessage('Password must contain at least one number.');
      return false;
    }
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(userPass)) {
      setErrorMessage('Password must contain at least one special character.');
      return false;
    }

    const email_exist = await userExist(trimmedEmail);
    if (email_exist) {
      setErrorMessage('Email already exists');
      return false;
    }

    return true;
  }

  // Indicates when the password confirmation matches.
  function passMatches() {
    return userPass !== '' && confirmPass !== '' && userPass === confirmPass;
  }

  // if (debugState) {
  //   return <UserDebug />;
  // }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">
          Join the community
        </Typography>
        <Typography variant="h3" component="h1">
          Create your account
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create your MUSEngage account to access events, rewards and community features.
        </Typography>
      </Stack>

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

      <Stack component="form" onSubmit={submitData} spacing={2}>
        <TextField
          type="text"
          name="userName"
          value={userName}
          placeholder="Enter Username"
          label="Username"
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isSubmitting}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <PersonIcon color="primary" aria-hidden="true" />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          type="email"
          name="email"
          value={userEmail}
          placeholder="Enter Email Address"
          label="Email"
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isSubmitting}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AlternateEmailIcon color="primary" aria-hidden="true" />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          type="password"
          value={userPass}
          name="password"
          placeholder="Enter Password"
          label="Password"
          onChange={(e) => setPass(e.target.value)}
          required
          disabled={isSubmitting}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockIcon color="primary" aria-hidden="true" />
              </InputAdornment>
            ),
          }}
        />

        <Typography variant="body2" color="text.secondary">
          Passwords must be at least 12 characters and include upper and lower case letters, a number, and a special
          character.
        </Typography>

        <TextField
          type="password"
          value={confirmPass}
          name="confirmPassword"
          placeholder="Confirm Password"
          label="Confirm Password"
          onChange={(e) => setConfirmPass(e.target.value)}
          required
          disabled={isSubmitting}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {passMatches() ? (
                  <CheckIcon color="success" aria-hidden="true" />
                ) : (
                  <LockIcon color="primary" aria-hidden="true" />
                )}
              </InputAdornment>
            ),
          }}
        />

        {renderConsentFields ? renderConsentFields({ disabled: isSubmitting }) : null}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
          <Button type="submit" variant="contained" disabled={isSubmitting || !consentsAccepted}>
            Submit
          </Button>
          {/* <Button type="button" variant="outlined" onClick={() => setDebugState(true)} disabled={isSubmitting}> */}
          {/*   Debug view */}
          {/* </Button> */}
        </Stack>
      </Stack>

      <Typography variant="body2">
        Already have an account?{' '}
        <Link component={RouterLink} to="/login">
          Log in
        </Link>
      </Typography>
    </Stack>
  );
}

export default Signup;
