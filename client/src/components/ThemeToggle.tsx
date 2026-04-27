import React from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC<{ compact?: boolean; className?: string }> = ({ compact = false, className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle-btn${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <SunIcon style={{ width: 17, height: 17 }} /> : <MoonIcon style={{ width: 17, height: 17 }} />}
      {!compact && <span>{isDark ? 'Light' : 'Night'}</span>}
    </button>
  );
};

export default ThemeToggle;

