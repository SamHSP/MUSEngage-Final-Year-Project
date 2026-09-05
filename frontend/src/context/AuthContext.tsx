import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import apiClient from '../lib/apiClient';

const API_BASE: string = import.meta.env.VITE_BACKEND_API;

type UserRole = 'student' | 'admin' | 'guest';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  rewardPoints: number;
  likedEvents: string[];
  profileImageUrl: string | null;
  emailVerified: boolean;
};

type ApiUser = Omit<User, 'emailVerified'> & { emailVerified?: boolean; email_verified?: boolean };

function normalizeUser(user: ApiUser | null): User | null {
  if (!user) {
    return null;
  }
  return {
    ...user,
    emailVerified: user.emailVerified ?? user.email_verified ?? false,
  };
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const latestPathRef = useRef(location.pathname);
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latestPathRef.current = location.pathname;
  }, [location.pathname]);

  const setUser = useCallback((value: User | null) => {
    setUserState(normalizeUser(value));
  }, []);

  const redirectToLogin = useCallback(() => {
    const pathname = latestPathRef.current;
    if (
      [
        '/',
        '/about',
        '/login',
        '/signup',
        '/otp',
        '/verify-email',
        '/privacy-policy',
        '/terms-of-service',
      ].includes(pathname)
    ) {
      return;
    }
    navigate('/about', { replace: true });
  }, [navigate]);

  const fetchCurrentUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<ApiUser>(`${API_BASE}/api/auth/me`);
      setUserState(normalizeUser(response.data));
    } catch (error) {
      setUserState(null);
      if (isAxiosError(error) && error.response?.status === 401) {
        redirectToLogin();
      } else if (import.meta.env.DEV) {
        console.error('Failed to fetch authenticated user', error);
      }
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (!user || user.role === 'guest') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          await apiClient.post(`${API_BASE}/api/refresh`);
        } catch (error) {
          if (isAxiosError(error) && error.response?.status === 401) {
            redirectToLogin();
          }
        }
      })();
    }, 10 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [user?.id, user?.role, redirectToLogin]);

  const refreshUser = useCallback(async () => {
    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post(`${API_BASE}/api/logout`);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to log out', error);
      }
    } finally {
      setUserState(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({ user, loading, setUser, refreshUser, logout }),
    [user, loading, setUser, refreshUser, logout],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

// Accessor hook for consuming the authentication context.
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export type { User, UserRole };
// eslint-disable-next-line react-refresh/only-export-components
export { AuthProvider, useAuth };
