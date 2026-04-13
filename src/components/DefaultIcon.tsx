import React from 'react';

interface DefaultIconProps {
  active: boolean;
  className?: string;
}

const DefaultIcon: React.FC<DefaultIconProps> = ({ active, className = "w-4 h-4" }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ color: active ? 'hsl(var(--primary))' : 'currentColor' }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        fill={active ? 'currentColor' : 'none'}
      />
      <text
        x="12"
        y="13"
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill={active ? 'white' : 'currentColor'}
        fontFamily="sans-serif"
        dominantBaseline="central"
      >
        D
      </text>
    </svg>
  );
};

export default DefaultIcon;
