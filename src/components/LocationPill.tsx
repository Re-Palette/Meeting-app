import { MapPin, Phone, Globe } from 'lucide-react';
import type { LocationType } from '../../shared/types';
import { LOCATION_LABEL } from '../lib/time';

export function GoogleMeetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 20" aria-hidden>
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H7v6H2z" fill="#ea4335" />
      <path d="M7 2h7.5A2.5 2.5 0 0 1 17 4.5V8l-5 0H7z" fill="#fbbc04" />
      <path d="M2 8h5v10H4.5A2.5 2.5 0 0 1 2 15.5z" fill="#4285f4" />
      <path d="M7 12h10v3.5a2.5 2.5 0 0 1-2.5 2.5H7z" fill="#34a853" />
      <path d="M7 8h10v4H7z" fill="#fff" />
      <path d="M17 7.5 22 4v12l-5-3.5z" fill="#34a853" />
      <path d="M17 7.5 22 4v6h-5z" fill="#188038" opacity="0.5" />
      <path d="M2 8h5v4H2z" fill="#1967d2" opacity="0.35" />
    </svg>
  );
}

export function ZoomIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#2d8cff" />
      <rect x="5.5" y="8.3" width="9" height="7.4" rx="2" fill="#fff" />
      <path d="M15.2 11 18.6 8.6v6.8L15.2 13z" fill="#fff" />
    </svg>
  );
}

export function LocationIcon({ type, size = 18 }: { type: LocationType; size?: number }) {
  if (type === 'google_meet') return <GoogleMeetIcon size={size} />;
  if (type === 'zoom') return <ZoomIcon size={size} />;
  if (type === 'in_person') return <MapPin size={size - 2} className="loc-pill__generic" />;
  if (type === 'phone') return <Phone size={size - 2} className="loc-pill__generic" />;
  return <Globe size={size - 2} className="loc-pill__generic" />;
}

export function LocationPill({ type, href }: { type: LocationType; href?: string }) {
  const inner = (
    <>
      <LocationIcon type={type} />
      {LOCATION_LABEL[type]}
    </>
  );
  if (href)
    return (
      <a className="loc-pill" href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {inner}
      </a>
    );
  return <span className="loc-pill">{inner}</span>;
}
