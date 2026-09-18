export function Logo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="14 11.4 42.6 42.6"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(28 32 32)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M32 13 49 28 32 38 15 28Z M32 23.55a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 1 0 0-6.4Z"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          d="M24.5 35V43.5Q24.5 47 32 47Q39.5 47 39.5 43.5V35"
        />
      </g>
      <line
        x1="48.9"
        y1="36.6"
        x2="48.9"
        y2="43.8"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="48.9" cy="47" r="2.5" fill="currentColor" />
    </svg>
  );
}
