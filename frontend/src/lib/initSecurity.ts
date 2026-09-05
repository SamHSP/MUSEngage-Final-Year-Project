import { setCsrfToken, API_BASE } from './apiClient';

export async function initializeSecurity(): Promise<void> {
  const csrfUrl = API_BASE ? `${API_BASE}/api/csrf-token` : '/api/csrf-token';
  try {
    const response = await fetch(csrfUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      console.error('Failed to fetch CSRF token', response.status, response.statusText);
      return;
    }
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'csrfToken' in data) {
      let tokenValue = (data as { csrfToken?: unknown }).csrfToken;
      
      // Handle array response from backend (if backend returns tuple)
      if (Array.isArray(tokenValue) && tokenValue.length > 0) {
        tokenValue = tokenValue[0];
      }
      
      if (typeof tokenValue === 'string' && tokenValue.length > 0) {
        // console.log('✓ CSRF token initialized:', tokenValue.substring(0, 16) + '...');
        setCsrfToken(tokenValue);
      } else {
        console.warn('⚠ CSRF token not received from backend');
      }
    }
  } catch (error) {
    console.error('Unable to initialize CSRF protection', error);
  }
}
