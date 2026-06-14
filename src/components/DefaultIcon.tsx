import React from 'react';

interface DefaultIconProps {
  active: boolean;
  className?: string;
}

/**
 * "Default" marker — a circled letter D drawn entirely as vector paths (no SVG
 * <text>, which renders/baselines inconsistently across sizes & browsers), so
 * the glyph stays pixel-stable at any size. Active = solid yellow badge.
 */
const DefaultIcon: React.FC<DefaultIconProps> = ({ active, className = 'w-4 h-4' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2"
        stroke={active ? '#facc15' : 'currentColor'}
        fill={active ? '#facc15' : 'none'}
      />
      {/* Letter D as a stroked vector path (stem + bowl) */}
      <path
        d="M9.5 7 L9.5 17 M9.5 7 C14.2 7 16 9.2 16 12 C16 14.8 14.2 17 9.5 17"
        stroke={active ? '#1a0a00' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

export default DefaultIcon;
