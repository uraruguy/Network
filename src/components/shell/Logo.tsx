export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34dbe3" />
          <stop offset="1" stopColor="#0a8f96" />
        </linearGradient>
        <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill="url(#ng)" />
      <rect width="64" height="64" rx="14.5" fill="url(#gl)" />
      <circle cx="32" cy="32" r="19" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.6" />
      <ellipse cx="32" cy="32" rx="8" ry="19" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" />
      <path d="M13 32 H51" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" />
      <path d="M20 44 V20 L44 44 V20" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      {[[20, 44], [20, 20], [44, 44], [44, 20]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="4.6" fill="#fff" />
          <circle cx={x} cy={y} r="2" fill="#0a8f96" />
        </g>
      ))}
    </svg>
  );
}
