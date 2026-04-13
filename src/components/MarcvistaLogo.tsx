interface MarcvistaLogoProps {
  className?: string;
}

const MarcvistaLogo = ({ className = "w-8 h-8" }: MarcvistaLogoProps) => {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Marcvista logo"
      role="img"
    >
      <g fill="#22C55E">
        <polygon points="54,71 150,275 271,150 436,184 216,314 325,337 288,409 221,395 240,500 185,351 123,332" />
      </g>
    </svg>
  );
};

export default MarcvistaLogo;
