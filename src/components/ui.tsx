import { useState, type ReactNode, type SVGProps } from 'react';
import { artUrls } from '../lib';

// Ikony rysowane ręcznie, jedna grubość linii — spójne z typografią
const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Icon = {
  Library: () => (
    <svg {...base}>
      <path d="M4 4v16M9 4v16M14 5l5 14.5" />
    </svg>
  ),
  Settings: () => (
    <svg {...base}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  ),
  Search: () => (
    <svg {...base}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  ),
  Back: () => (
    <svg {...base}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  Chevron: () => (
    <svg {...base}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  External: () => (
    <svg {...base} width={14} height={14}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
  Refresh: () => (
    <svg {...base} width={16} height={16}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  ),
  Lock: () => (
    <svg {...base}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  Check: () => (
    <svg {...base}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  Warn: () => (
    <svg {...base} width={14} height={14}>
      <path d="M12 4 2.5 20h19L12 4zM12 10v4M12 17.2v.1" />
    </svg>
  ),
  Eye: () => (
    <svg {...base} width={16} height={16}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
};

/** Znak aplikacji: celownik z gwiazdą. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--gold)" strokeWidth="2.2" />
      <path d="M16 1.5v6M16 24.5v6M1.5 16h6M24.5 16h6" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 10.2l1.7 4.1 4.1 1.7-4.1 1.7-1.7 4.1-1.7-4.1-4.1-1.7 4.1-1.7z" fill="var(--gold)" />
    </svg>
  );
}

/** Grafika ze Steam z kolejnymi adresami zapasowymi; na koniec pokazuje nazwę. */
export function SteamArt({
  appid,
  file,
  alt,
  className,
}: {
  appid: number;
  file: 'header.jpg' | 'library_hero.jpg';
  alt: string;
  className?: string;
}) {
  const urls = file === 'library_hero.jpg' ? [...artUrls(appid, 'library_hero.jpg'), ...artUrls(appid, 'header.jpg')] : artUrls(appid, file);
  const [i, setI] = useState(0);
  if (i >= urls.length) {
    return (
      <div className={`art-fallback ${className ?? ''}`}>
        <span>{alt}</span>
      </div>
    );
  }
  return <img className={className} src={urls[i]} alt={alt} loading="lazy" draggable={false} onError={() => setI(i + 1)} />;
}

export function Ring({ value, size = 64, stroke = 4, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line-strong)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--gold)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, value / 100))}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}
