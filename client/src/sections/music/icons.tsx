/** Shared transport-control glyphs for the Music player and the overview card. */
export const MusicIcon = {
  shuffle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h3.5c1.6 0 2.5.9 3.6 2.4M20 6h-3.6c-2.9 0-4 3-6.4 6.4S6.6 18 3.7 18" />
      <path d="M4 18h3.5c1.6 0 2.5-.9 3.6-2.4" /><path d="M17 3l3 3-3 3M17 21l3-3-3-3" />
    </svg>
  ),
  previous: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14a1 1 0 0 0 2 0v-5.2l9.5 5.9A1 1 0 0 0 20 19V5a1 1 0 0 0-1.5-.8L9 10V5a1 1 0 0 0-2 0Z" /></svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 5v14a1 1 0 0 1-2 0v-5.2L5.5 19.7A1 1 0 0 1 4 19V5a1 1 0 0 1 1.5-.8L15 10V5a1 1 0 0 1 2 0Z" /></svg>
  ),
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2Z" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>,
  repeat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11V8a4 4 0 0 1 4-4h9M4 11l3-3M4 11l3 3" />
      <path d="M20 12v2a4 4 0 0 1-4 4H7M20 14l-3 3M20 14l-3-3" />
    </svg>
  ),
} as const;
