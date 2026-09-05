import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';

export const API_BASE = (import.meta.env.VITE_BACKEND_API ?? '').toString().replace(/\/+$/, '');

axios.defaults.withCredentials = true;

const CSRF_HEADER = 'X-CSRF-Token';
let currentCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  currentCsrfToken = token;
  if (token) {
    axios.defaults.headers.common[CSRF_HEADER] = token;
    refreshClient.defaults.headers.common[CSRF_HEADER] = token;
  } else {
    delete axios.defaults.headers.common[CSRF_HEADER];
    delete refreshClient.defaults.headers.common[CSRF_HEADER];
  }
}

const refreshClient: AxiosInstance = axios.create({
  withCredentials: true,
});

refreshClient.interceptors.request.use((config) => {
  if (currentCsrfToken) {
    config.headers = config.headers ?? {};
    config.headers[CSRF_HEADER] = currentCsrfToken;  // ← NO if statement here
  }
  return config;
});

axios.interceptors.request.use((config) => {
  if (currentCsrfToken) {
    config.headers = config.headers ?? {};
    config.headers[CSRF_HEADER] = currentCsrfToken;  // ← NO if statement here
  }
  return config;
});

let refreshRequest: Promise<void> | null = null;

async function performRefresh(): Promise<void> {
  if (!refreshRequest) {
    const refreshUrl = API_BASE ? `${API_BASE}/api/refresh` : '/api/refresh';
    refreshRequest = refreshClient.post(refreshUrl).then(() => undefined).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

axios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const { response, config } = error;
    if (!response || !config) {
      throw error;
    }

    if (response.status === 403) {
      return Promise.reject(error);
    }

    if (response.status !== 401) {
      throw error;
    }

    const requestConfig = config as RetriableConfig;
    if (requestConfig._retry) {
      throw error;
    }

    const requestUrl = requestConfig.url ?? '';
    if (
      requestUrl.includes('/api/refresh') || 
      requestUrl.includes('/api/logout') ||
      requestUrl.includes('/api/csrf-token') //||
      // requestUrl.includes('/api/auth/me')
    ) {
      throw error;
    }

    requestConfig._retry = true;
    try {
      await performRefresh();
    } catch {
      const currentPath = window.location.pathname;
      const publicPaths = [
        '/',
        '/about',
        '/login',
        '/signup',
        '/otp',
        '/verify-email',
        '/privacy-policy',
        '/terms-of-service',
      ];
      if (!publicPaths.includes(currentPath)) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
    return axios(requestConfig);
  },
);

export default axios;
