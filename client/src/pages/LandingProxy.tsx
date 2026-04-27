import React from 'react';

const LandingProxy: React.FC = () => {
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
