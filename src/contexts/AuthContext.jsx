import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

export const AuthContext = createContext(null);

// Access token lives in JS memory only — never localStorage, never a readable cookie
let _memoryToken = null;

export function getMemoryToken() {
  return _memoryToken;
}

export function setMemoryToken(token) {
  _memoryToken = token;
}

const api = axios.create({ baseURL: '/api', withCredentials: true });

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef       = useRef(null);

  const clearTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  /**
   * Parse a JWT and return the number of ms until it expires (minus 60s buffer).
   */
  function msUntilExpiry(token) {
    try {
      const [, payload] = token.split('.');
      const { exp } = JSON.parse(atob(payload));
      return exp * 1000 - Date.now() - 60_000;
    } catch {
      return 0;
    }
  }

  const scheduleRefresh = useCallback((token) => {
    clearTimer();
    const delay = msUntilExpiry(token);
    if (delay <= 0) return;
    refreshTimerRef.current = setTimeout(() => silentRefresh(), delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const silentRefresh = useCallback(async () => {
    try {
      const { data } = await api.post('/auth/refresh');
      _memoryToken = data.accessToken;
      setUser(data.user);
      scheduleRefresh(data.accessToken);
    } catch {
      _memoryToken = null;
      setUser(null);
      clearTimer();
    }
  }, [scheduleRefresh]);

  // On mount: attempt silent refresh using the HttpOnly refresh cookie
  useEffect(() => {
    silentRefresh().finally(() => setLoading(false));
    return () => clearTimer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    _memoryToken = data.accessToken;
    setUser(data.user);
    scheduleRefresh(data.accessToken);
    return data.user;
  }, [scheduleRefresh]);

  const register = useCallback(async (email, password, displayName) => {
    const { data } = await api.post('/auth/register', { email, password, displayName });
    _memoryToken = data.accessToken;
    setUser(data.user);
    scheduleRefresh(data.accessToken);
    return data.user;
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    _memoryToken = null;
    setUser(null);
    clearTimer();
  }, []);

  /**
   * Called by AuthCallbackPage after Google OAuth redirect.
   * The access token arrives in the URL fragment (never logged by servers).
   */
  const handleOAuthCallback = useCallback(async (token) => {
    _memoryToken = token;
    scheduleRefresh(token);
    const { data } = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    setUser(data.user);
    return data.user;
  }, [scheduleRefresh]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, handleOAuthCallback }}>
      {children}
    </AuthContext.Provider>
  );
}
