import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm.jsx';
import RegisterForm from '../components/auth/RegisterForm.jsx';

export default function LoginPage() {
  const [view, setView] = useState('login');
  const navigate = useNavigate();

  function handleSuccess() {
    navigate('/', { replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo">MicroSight</div>
          <div className="logo-sub">Sightreading Trainer</div>
        </div>
        {view === 'login' ? (
          <LoginForm onSuccess={handleSuccess} onSwitchToRegister={() => setView('register')} />
        ) : (
          <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={() => setView('login')} />
        )}
      </div>
    </div>
  );
}
