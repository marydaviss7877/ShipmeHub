import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LandingProxy: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Already logged in → skip the landing page, go straight to the app
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  return (
    <iframe
      title="Label Flow Landing"
      src="/landing.html"
      style={{
        width: '100%',
        height: '100vh',
        border: 'none',
        display: 'block',
      }}
    />
  );
};

export default LandingProxy;
