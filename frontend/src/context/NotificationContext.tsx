import { Alert, Snackbar } from '@mui/material';
import axios from 'axios';
import {
  createContext,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import type { NotificationRecord } from '../types/notifications';

const API = import.meta.env.VITE_BACKEND_API;

type NotificationContextValue = {
  notifications: NotificationRecord[];
  unreadCount: number;
  refresh: (options?: { suppressToast?: boolean }) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [toastQueue, setToastQueue] = useState<NotificationRecord[]>([]);
  const [activeToast, setActiveToast] = useState<NotificationRecord | null>(null);
  const initialisedRef = useRef(false);

  const refresh = useCallback(
    async (options?: { suppressToast?: boolean }) => {
      if (!user || user.role === 'guest') {
        setNotifications([]);
        setToastQueue([]);
        setActiveToast(null);
        return;
      }

      const suppressToast = options?.suppressToast ?? false;

      try {
        const response = await axios.get<NotificationRecord[]>(`${API}/api/notifications`, {
          params: { userId: user.id, limit: 25 },
        });
        const fetched = Array.isArray(response.data) ? response.data : [];
        setNotifications((previous) => {
          const previousIds = new Set(previous.map((item) => item.id));
          const newItems = fetched.filter((item) => !previousIds.has(item.id));
          const newUnread = newItems.filter((item) => !item.read);
          if (!suppressToast && initialisedRef.current && newUnread.length > 0) {
            setToastQueue((queue) => [...queue, ...newUnread]);
          }
          return fetched;
        });
        initialisedRef.current = true;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('Failed to load notifications', error);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user || user.role === 'guest') {
      setNotifications([]);
      setToastQueue([]);
      setActiveToast(null);
      return;
    }

    initialisedRef.current = false;

    let cancelled = false;

    const loadNotifications = async () => {
      if (cancelled) {
        return;
      }
      await refresh({ suppressToast: true });
    };

    void loadNotifications();
    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === 'PUSH_NOTIFICATION') {
        void refresh();
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [refresh]);

  useEffect(() => {
    if (!activeToast && toastQueue.length > 0) {
      setActiveToast(toastQueue[0]);
      setToastQueue((queue) => queue.slice(1));
    }
  }, [toastQueue, activeToast]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user) {
        return;
      }
      try {
        const response = await axios.post<NotificationRecord>(
          `${API}/api/notifications/${notificationId}/read`,
          { userId: user.id, read: true },
        );
        const updated = response.data;
        setNotifications((previous) =>
          previous.map((item) => (item.id === updated.id ? { ...item, ...updated, read: true } : item)),
        );
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('Failed to mark notification as read', error);
        }
      }
    },
    [user],
  );

  const markAllAsRead = useCallback(async () => {
    if (!user) {
      return;
    }
    try {
      await axios.post(`${API}/api/notifications/mark-all-read`, { userId: user.id });
      setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
      setToastQueue([]);
      setActiveToast(null);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to mark all notifications as read', error);
      }
    }
  }, [user]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => (notification.read ? count : count + 1), 0),
    [notifications],
  );

  const handleToastClose = useCallback(
    (_event: SyntheticEvent | Event | undefined, reason?: string) => {
      if (reason === 'clickaway') {
        return;
      }
      setActiveToast(null);
    },
    [],
  );

  const clearAll = useCallback(async () => {
    if (!user) {
      return;
    }
    try {
      await axios.delete(`${API}/api/notifications`, { data: { userId: user.id } });
      setNotifications([]);
      setToastQueue([]);
      setActiveToast(null);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to clear notifications', error);
      }
    }
  }, [user]);

  const contextValue = useMemo<NotificationContextValue>(
    () => ({ notifications, unreadCount, refresh, markAsRead, markAllAsRead, clearAll }),
    [notifications, unreadCount, refresh, markAsRead, markAllAsRead, clearAll],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={Boolean(activeToast)}
        autoHideDuration={6000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleToastClose}
          severity="info"
          sx={{ width: '100%' }}
          variant="filled"
        >
          <strong>{activeToast?.title}</strong>
          <br />
          {activeToast?.body}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export { NotificationProvider, NotificationContext };
