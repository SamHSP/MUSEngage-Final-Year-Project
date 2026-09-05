import { useEffect, useState } from 'react';

const PRIVACY_CONSENT_STORAGE_KEY = 'musengage_privacy_consent';

// Tracks whether the user has accepted the privacy notice.
export function usePrivacyConsent(): boolean {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const checkConsent = () => {
      const consent = localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) === 'true';
      setHasConsent(consent);
    };

    checkConsent();

    // Listen for storage changes (in case consent is accepted in another tab or component)
    window.addEventListener('storage', checkConsent);

    // Listen for custom event when consent is accepted in the same window
    const handleConsentChange = () => checkConsent();
    window.addEventListener('privacy-consent-accepted', handleConsentChange);

    return () => {
      window.removeEventListener('storage', checkConsent);
      window.removeEventListener('privacy-consent-accepted', handleConsentChange);
    };
  }, []);

  return hasConsent;
}
