export function Logo({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line next/no-img-element -- original bundled Figma brand asset
    <img
      className={`academic-logo ${className}`}
      src="/illustrations/academic-logo.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
