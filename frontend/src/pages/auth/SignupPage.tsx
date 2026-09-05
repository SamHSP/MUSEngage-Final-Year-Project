import { type ChangeEvent, useCallback, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Checkbox, FormControlLabel, FormHelperText, Link, Stack, Typography } from '@mui/material';
import Signup from './components/SignupForm';
import Seo from '../../components/Seo';

// Wraps the signup form for routing purposes.
function SignupPage() {
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [showConsentError, setShowConsentError] = useState(false);

  const consentsAccepted = privacyConsent && termsConsent;

  const handlePrivacyChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setPrivacyConsent(nextValue);
    if (nextValue && termsConsent) {
      setShowConsentError(false);
    }
  }, [termsConsent]);

  const handleTermsChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setTermsConsent(nextValue);
    if (nextValue && privacyConsent) {
      setShowConsentError(false);
    }
  }, [privacyConsent]);

  const renderConsentFields = useCallback(
    ({ disabled }: { disabled: boolean }) => (
      <Stack spacing={1}>
        <FormControlLabel
          control={<Checkbox color="primary" checked={privacyConsent} onChange={handlePrivacyChange} disabled={disabled} />}
          label={
            <Typography variant="body2">
              I agree to the{' '}
              <Link component={RouterLink} to="/privacy-policy" rel="noopener noreferrer">
                Privacy Policy
              </Link>
              .
            </Typography>
          }
        />
        <FormControlLabel
          control={<Checkbox color="primary" checked={termsConsent} onChange={handleTermsChange} disabled={disabled} />}
          label={
            <Typography variant="body2">
              I agree to the{' '}
              <Link component={RouterLink} to="/terms-of-service" rel="noopener noreferrer">
                Terms of Service
              </Link>
              .
            </Typography>
          }
        />
        {showConsentError && !consentsAccepted ? (
          <FormHelperText error>Please accept the Privacy Policy and Terms of Service to continue.</FormHelperText>
        ) : null}
      </Stack>
    ),
    [consentsAccepted, handlePrivacyChange, handleTermsChange, privacyConsent, termsConsent, showConsentError],
  );

  return (
    <>
      <Seo
        title="Sign up — MUSEngage"
        description="Create your MUSEngage account to discover events, communities, and rewards."
        canonical="https://musengage.site/signup"
      />
      <Signup
        consentsAccepted={consentsAccepted}
        onRequireConsents={() => setShowConsentError(true)}
        renderConsentFields={renderConsentFields}
      />
    </>
  );
}

export default SignupPage;
