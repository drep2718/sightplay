import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/**
 * Landing page for Google OAuth callback.
 * The access token arrives in the URL fragment:
 *   https://microsight.app/auth/callback#token=eyJ...
 * Fragments are never sent to the server, never in server logs.
 */
export default function AuthCallbackPage() {
  const { handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    const token = params.get('token');

    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    // Clear the fragment from the URL immediately so it doesn't linger
    history.replaceState(null, '', window.location.pathname);

    handleOAuthCallback(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login?error=oauth_failed', { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>Signing you in…</p>
    </div>
  );
}
