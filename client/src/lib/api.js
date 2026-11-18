import axios from 'axios';

const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
  timeout: 25_000,
});

let accessToken = null;
let refreshPromise = null;
const handlers = { onSession: null, onExpired: null };

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function configureApi(next) {
  Object.assign(handlers, next);
}

export function unwrap(response) {
  return response?.data?.data;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (!response || !config) return Promise.reject(error);

    const isAuthRoute = /\/auth\/(login|register|refresh|logout)$/.test(config.url || '');
    if (
      response.status !== 401 ||
      config.skipAuthRefresh ||
      config._retried ||
      isAuthRoute ||
      !handlers.onExpired
    ) {
      return Promise.reject(error);
    }

    if (!refreshPromise) {
      refreshPromise = api
        .post('/auth/refresh', null, { skipAuthRefresh: true })
        .then((res) => {
          const session = res.data.data;
          if (!session) throw new Error('No active session');
          setAccessToken(session.accessToken);
          handlers.onSession?.(session);
          return session.accessToken;
        })
        .catch((refreshError) => {
          setAccessToken(null);
          handlers.onExpired?.();
          throw refreshError;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      const token = await refreshPromise;
      config._retried = true;
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
      return api(config);
    } catch {
      return Promise.reject(error);
    }
  },
);
