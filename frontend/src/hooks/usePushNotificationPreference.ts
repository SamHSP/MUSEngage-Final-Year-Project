import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/useNotifications';
import { base64UrlToUint8Array } from '../utils/push';

const API = import.meta.env.VITE_BACKEND_API;

type StatusMessage = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type PushPreferenceState = {
  supported: boolean;
  canManage: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  status: StatusMessage | null;
  ready: boolean;
  permissionMessage: string;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
  setStatus: (value: StatusMessage | null) => void;
};

const getInitialPermission = (): NotificationPermission => {
  if (typeof Notification === 'undefined') {
    return 'default';
  }
  return Notification.permission;
};

export function usePushNotificationPreference(): PushPreferenceState {
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(getInitialPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [vapidLoaded, setVapidLoaded] = useState(false);

  const canManage = Boolean(user && user.role !== 'guest');

  const loadVapidKey = useCallback(async (): Promise<string | null> => {
    try {
      const response = await axios.get<{ publicKey: string | null }>(`${API}/api/notifications/vapid-public-key`);
      const key = response.data?.publicKey ?? null;
      setVapidKey(key);
      return key;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to load VAPID key', error);
      }
      setVapidKey(null);
      return null;
    } finally {
      setVapidLoaded(true);
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!canManage || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSubscribed(false);
      return;
    }
    try {
      // Wait for service worker with timeout
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker ready timeout')), 5000)
        ),
      ]);
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to check push subscription', error);
      }
      setSubscribed(false);
    }
  }, [canManage]);

  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';
    setSupported(isSupported);
    if (!isSupported || !canManage) {
      setSubscribed(false);
      return;
    }
    void loadVapidKey();
    void checkSubscription();
  }, [canManage, loadVapidKey, checkSubscription]);

  const ensureVapidKey = useCallback(async () => {
    if (vapidKey) {
      return vapidKey;
    }
    return await loadVapidKey();
  }, [vapidKey, loadVapidKey]);

  const enablePush = useCallback(async () => {
    if (!canManage || !supported) {
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      if (permission === 'denied') {
        setStatus({
          type: 'error',
          message: 'Notifications are blocked in your browser settings. Enable them to receive updates.',
        });
        return;
      }

      if (typeof Notification === 'undefined') {
        setStatus({ type: 'error', message: 'Notifications are not supported in this environment.' });
        return;
      }

      if (permission !== 'granted') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          setStatus({ type: 'info', message: 'Push notifications remain disabled until permission is granted.' });
          return;
        }
      }

      // Wait for service worker with timeout
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker ready timeout')), 10000)
        ),
      ]);

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await ensureVapidKey();
        if (!publicKey) {
          setStatus({ type: 'error', message: 'Push notifications are temporarily unavailable. Please try again later.' });
          return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        });
      }

      await axios.post(`${API}/api/notifications/subscribe`, {
        userId: user?.id,
        subscription: subscription.toJSON(),
      });
      setSubscribed(true);
      setStatus({ type: 'success', message: 'Push notifications enabled.' });
      await refresh({ suppressToast: true });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to enable push notifications', error);
      }
      const errorMessage =
        error instanceof Error && error.message.includes('timeout')
          ? 'Service worker is not available. Please refresh the page and try again.'
          : 'Unable to enable push notifications. Please try again later.';
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  }, [canManage, supported, permission, ensureVapidKey, refresh, user?.id]);

  const disablePush = useCallback(async () => {
    if (!canManage || !supported) {
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      // Wait for service worker with timeout
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker ready timeout')), 10000)
        ),
      ]);

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setSubscribed(false);
        setStatus({ type: 'info', message: 'Push notifications were already disabled.' });
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await axios.post(`${API}/api/notifications/unsubscribe`, {
        userId: user?.id,
        endpoint,
      });
      setSubscribed(false);
      setStatus({ type: 'success', message: 'Push notifications disabled.' });
      await refresh({ suppressToast: true });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to disable push notifications', error);
      }
      const errorMessage =
        error instanceof Error && error.message.includes('timeout')
          ? 'Service worker is not available. Please refresh the page and try again.'
          : 'Unable to disable push notifications. Please try again later.';
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  }, [canManage, supported, refresh, user?.id]);

  const permissionMessage = useMemo(() => {
    if (permission === 'denied') {
      return 'Push notifications are blocked by your browser. Update your notification permissions to enable them.';
    }
    if (permission === 'granted') {
      return 'Push notifications are enabled in your browser. You can toggle subscription below.';
    }
    return 'Allow notifications so we can send you updates even when MUSEngage is closed.';
  }, [permission]);

  return {
    supported,
    canManage,
    permission,
    subscribed,
    loading,
    status,
    ready: !canManage ? false : vapidLoaded,
    permissionMessage,
    enablePush,
    disablePush,
    setStatus,
  };
}

export type { StatusMessage };
