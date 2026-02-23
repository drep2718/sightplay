import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import GoogleButton from './GoogleButton.jsx';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export default function LoginForm({ onSuccess, onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setLoading(true);
    try {
      await login('demo@microsight.app', 'demo');
      onSuccess?.();
    } catch (err) {
      setError('Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form">
      <h2>Sign in to MicroSight</h2>

      {IS_DEMO && (
        <>
          <button
            type="button"
            className="demo-login-btn"
            onClick={handleDemoLogin}
            disabled={loading}
          >
            Try Demo — no account needed
          </button>
          <div className="auth-divider"><span>or sign in</span></div>
        </>
      )}

      {!IS_DEMO && <GoogleButton />}
      {!IS_DEMO && <div className="auth-divider"><span>or</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="auth-switch">
        No account?{' '}
        <button className="auth-link" onClick={onSwitchToRegister}>Create one</button>
      </p>
    </div>
  );
}
