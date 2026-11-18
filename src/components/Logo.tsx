import { useId } from 'react';

export function LogoMark({ size = 62 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 100 62" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`lg-a${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#d9f6ef" />
          <stop offset="1" stopColor="#8fe9d6" />
        </linearGradient>
        <radialGradient id={`lg-b${id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#cfe9ef" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9cc4cf" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="35" rx="44" ry="17" transform="rotate(-16 50 35)" stroke={`url(#lg-a${id})`} strokeWidth="4" />
      <ellipse cx="50" cy="35" rx="30" ry="10" transform="rotate(-16 50 35)" fill={`url(#lg-b${id})`} opacity="0.7" />
      <circle cx="21" cy="12" r="3.2" fill="#fff" />
      <circle cx="21" cy="12" r="7" fill="#fff" opacity="0.25" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`logo${dark ? ' logo--dark' : ''}`}>
      <LogoMark />
      <span className="logo__text">MeetFlow</span>
    </div>
  );
}
