import React from 'react';

type BrandMonogramProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const BrandMonogram: React.FC<BrandMonogramProps> = ({
  size = 18,
  color = 'currentColor',
  strokeWidth = 2.5,
}) => (
  <svg
    viewBox="0 0 40 40"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="6.5" y="6.5" width="27" height="27" rx="7" fill="none" stroke={color} strokeWidth="1.9" />
    <path d="M13 12.5 V27.5 H22.5" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.5 20 H27" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <path d="M18.5 27.5 H25.5" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </svg>
);

export default BrandMonogram;
