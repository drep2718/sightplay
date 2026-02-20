import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import GoogleButton from './GoogleButton.jsx';

export default function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const { register } = useAuth();
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [displayName, setDisplayName]   = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form">
      <h2>Create your account</h2>

      <GoogleButton />

      <div className="auth-divider"><span>or</span></div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="reg-name">Display name</label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            maxLength={50}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-password">Password <span className="hint">(min 8 chars)</span></label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{' '}
        <button className="auth-link" onClick={onSwitchToLogin}>Sign in</button>
      </p>
    </div>
  );
}
