import { useEffect, useState } from 'react';

// Reads the current navigator.onLine flag in a safe way for SSR environments.
const readNavigatorStatus = () => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true);

// Tracks the browser's online/offline status using the native navigator API.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(readNavigatorStatus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
