import React from 'react';

/**
 * Placeholder logo mark — a Claude-style "spark" / asterisk.
 * Swap this out for your own Claude × Lovable logo when ready.
 */
export function Spark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
        <line x1="12" y1="3.2" x2="12" y2="9" />
        <line x1="12" y1="15" x2="12" y2="20.8" />
        <line x1="3.2" y1="12" x2="9" y2="12" />
        <line x1="15" y1="12" x2="20.8" y2="12" />
        <line x1="6" y1="6" x2="9.6" y2="9.6" />
        <line x1="14.4" y1="14.4" x2="18" y2="18" />
        <line x1="18" y1="6" x2="14.4" y2="9.6" />
        <line x1="9.6" y1="14.4" x2="6" y2="18" />
      </g>
    </svg>
  );
}

const PALETTE = ['#C25B3B', '#5E8C6A', '#5572A8', '#B5793C', '#9C5BA0', '#3F8E96'];

/** Deterministic warm avatar color from a project name. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Up-to-two-letter initials from a project name. */
export function initials(name: string): string {
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
