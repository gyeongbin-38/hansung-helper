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
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 2.5 27 6.7v8.4c0 7.1-4.4 11.9-11 14.4-6.6-2.5-11-7.3-11-14.4V6.7L16 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.3 12.1c2.5-.4 4.8.2 6.7 1.8v8c-1.9-1.6-4.2-2.2-6.7-1.8v-8Zm13.4 0c-2.5-.4-4.8.2-6.7 1.8v8c1.9-1.6 4.2-2.2 6.7-1.8v-8Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path d="M16 14v8" stroke="var(--nt-navy, #fff)" strokeWidth="1.1" />
    </svg>
  );
}
