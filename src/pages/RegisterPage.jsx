import React from 'react';
import { useNavigate } from 'react-router-dom';
import RegisterForm from '../components/auth/RegisterForm.jsx';

export default function RegisterPage() {
  const navigate = useNavigate();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo">MicroSight</div>
          <div className="logo-sub">Sightreading Trainer</div>
        </div>
        <RegisterForm
          onSuccess={() => navigate('/', { replace: true })}
          onSwitchToLogin={() => navigate('/login')}
        />
      </div>
    </div>
  );
}
