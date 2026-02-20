import axios from 'axios';
import { getMemoryToken, setMemoryToken } from '../contexts/AuthContext.jsx';

// Single shared instance — interceptors set up once at module level
const api = axios.create({ baseURL: '/api', withCredentials: true });

// Attach the in-memory access token to every request
api.interceptors.request.use((config) => {
  const token = getMemoryToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401: attempt one silent refresh then retry; on failure dispatch logout event
let isRefreshing = false;
let pendingQueue = [];

function drainQueue(error, token) {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      setMemoryToken(data.accessToken);
      drainQueue(null, data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshError) {
      drainQueue(refreshError, null);
      setMemoryToken(null);
      window.dispatchEvent(new Event('auth:logout'));
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

/**
 * Hook that returns the shared authenticated axios instance.
 */
export function useApi() {
  return api;
}

// Also export the bare instance for use outside of React components
export { api };
