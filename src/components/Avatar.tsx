const PALETTE = [
  ['#7fe0cf', '#2fbfab'],
  ['#a9b4ff', '#6e6be6'],
  ['#ffc49b', '#f08a3c'],
  ['#9fd0ff', '#3f8cf0'],
  ['#ffaccb', '#e8689a'],
  ['#9fe7bf', '#3fca8f'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/[\s　]+/);
  if (/^[\x00-\x7F]+$/.test(t)) return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return parts[0].slice(0, 1) + (parts[1] ? parts[1].slice(0, 1) : '');
}

export function Avatar({ name, size = 44, person = false }: { name: string; size?: number; person?: boolean }) {
  if (person) {
    return (
      <span className="avatar avatar--person" style={{ width: size, height: size }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 48 48">
          <circle cx="24" cy="19" r="8.5" fill="#97a3ae" />
          <path d="M8 46c1.5-9 8-14 16-14s14.5 5 16 14" fill="#97a3ae" />
        </svg>
      </span>
    );
  }
  const [a, b] = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
