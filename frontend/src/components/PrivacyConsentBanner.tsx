import { useEffect, useState } from 'react';
import { Button, Link, Snackbar, SnackbarContent, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const PRIVACY_CONSENT_STORAGE_KEY = 'musengage_privacy_consent';

// Displays a PDPA consent banner for unauthenticated visitors.
const PrivacyConsentBanner = () => {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHasConsent(false);
      return;
    }
    setHasConsent(localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || loading || hasConsent === null) {
      return;
    }

    if (user) {
      setOpen(false);
      setInitialised(true);
      return;
    }

    setOpen(!hasConsent);
    setInitialised(true);
  }, [hasConsent, loading, user]);

  const handleAccept = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, 'true');
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('privacy-consent-accepted'));
    }
    setHasConsent(true);
    setOpen(false);
  };

  if (!initialised || user || !open) {
    return null;
  }

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transitionDuration={{ enter: 300, exit: 200 }}
      sx={{
        '& .MuiSnackbarContent-root': {
          backgroundColor: 'background.paper',
          color: 'text.primary',
          borderRadius: 1,
          boxShadow: '0 16px 40px rgba(14, 28, 37, 0.16)',
          maxWidth: 600,
          width: { xs: 'calc(100% - 32px)', sm: 'auto' },
        },
      }}
    >
      <SnackbarContent
        message={
          <Stack spacing={1} sx={{ pr: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Privacy notice
            </Typography>
            <Typography variant="body2" color="text.secondary">
              By using MUSEngage, you consent to our collection and use of your personal data as described in our{' '}
              <Link
                href="/privacy-policy"
                rel="noopener noreferrer"
                underline="hover"
              >
                Privacy Policy
              </Link>
              .
            </Typography>
          </Stack>
        }
        action={
          <Button onClick={handleAccept} variant="contained" color="primary" size="small">
            Accept
          </Button>
        }
      />
    </Snackbar>
  );
};

export default PrivacyConsentBanner;
