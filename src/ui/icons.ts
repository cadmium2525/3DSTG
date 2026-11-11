/** Inline SVG icons (no external assets). */

/** Hidden sprite with the ribbon-bow symbol + its gradients; injected once. */
export const SPRITE = `
<svg class="bd-sprite" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="bd-bow-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fb4ff"/>
      <stop offset="0.55" stop-color="#3d6be0"/>
      <stop offset="1" stop-color="#2346a8"/>
    </linearGradient>
    <linearGradient id="bd-bow-k" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="1" stop-color="#e0a93a"/>
    </linearGradient>
    <symbol id="bd-bow" viewBox="0 0 32 26">
      <path d="M15 14.2 L10.6 24.4 L13.6 23.2 L16 15.4 Z" fill="url(#bd-bow-g)" stroke="#d7e4ff" stroke-width="0.7" stroke-linejoin="round"/>
      <path d="M17 14.2 L21.4 24.4 L18.4 23.2 L16 15.4 Z" fill="url(#bd-bow-g)" stroke="#d7e4ff" stroke-width="0.7" stroke-linejoin="round"/>
      <path d="M16 12.5 C10.5 4.2 2.6 3.6 2.6 9.4 C2.6 15.2 10.4 15.8 16 12.5 Z" fill="url(#bd-bow-g)" stroke="#d7e4ff" stroke-width="0.8" stroke-linejoin="round"/>
      <path d="M16 12.5 C21.5 4.2 29.4 3.6 29.4 9.4 C29.4 15.2 21.6 15.8 16 12.5 Z" fill="url(#bd-bow-g)" stroke="#d7e4ff" stroke-width="0.8" stroke-linejoin="round"/>
      <path d="M6 8.6 C7.6 7 10.4 7.6 12.6 10.2" fill="none" stroke="#e8f0ff" stroke-opacity="0.75" stroke-width="0.9" stroke-linecap="round"/>
      <path d="M26 8.6 C24.4 7 21.6 7.6 19.4 10.2" fill="none" stroke="#e8f0ff" stroke-opacity="0.75" stroke-width="0.9" stroke-linecap="round"/>
      <ellipse cx="16" cy="12.6" rx="2.6" ry="3.1" fill="url(#bd-bow-k)" stroke="#fff6d8" stroke-width="0.6"/>
    </symbol>
  </defs>
</svg>`;

export const BOW = '<svg class="bd-bow" viewBox="0 0 32 26" aria-hidden="true"><use href="#bd-bow"/></svg>';

export const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1.4"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.4"/></svg>';

export const ICON_GEAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.8l1.6 2.3 2.7-.6.7 2.7 2.6 1-.6 2.7 1.9 2.1-1.9 2.1.6 2.7-2.6 1-.7 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.7-2.7-2.6-1 .6-2.7L3.1 11l1.9-2.1-.6-2.7 2.6-1 .7-2.7 2.7.6z"/><circle cx="12" cy="12" r="3.2"/></svg>';

export const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** Slow-mode icon: focused hitbox dot with rings. */
export const ICON_SLOW =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.5" stroke-width="1.2" stroke-dasharray="2.2 2.4"/><circle cx="12" cy="12" r="4.6" stroke-width="1.4"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>';

export const ICON_DRAG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>';

export const ICON_SHOT =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 20V9M12 20V4M16 20V9"/><circle cx="8" cy="7" r="1.2" fill="currentColor"/><circle cx="12" cy="2.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1.2" fill="currentColor"/></svg>';

export const ICON_GRAZE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="13" r="3"/><path d="M4 7c3-2.5 6.5-3 9-2.4M20 9.5c.8 2.5.2 5.5-2 7.8" stroke-dasharray="1.8 2.2"/><circle cx="17.5" cy="5.5" r="2" fill="currentColor" stroke="none"/></svg>';

export const ICON_SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity="0.25"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

export const ICON_SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity="0.25"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

/** 光の結界 (bomb) icon: hexagonal barrier with a radiant core. */
export const ICON_BARRIER =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M12 2.4l8.3 4.8v9.6L12 21.6l-8.3-4.8V7.2z" stroke-width="1.4"/><path d="M12 7.3l4.1 2.35v4.7L12 16.7l-4.1-2.35v-4.7z" stroke-width="1.1" fill="currentColor" fill-opacity="0.22"/><path d="M12 2.4v4.9M20.3 7.2l-4.2 2.45M20.3 16.8l-4.2-2.45M12 21.6v-4.9M3.7 16.8l4.2-2.45M3.7 7.2l4.2 2.45" stroke-width="0.8" stroke-opacity="0.7"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>';

/** Small HUD pip for one bomb in stock. */
export const BARRIER_PIP =
  '<svg class="bd-bomb-pip" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l8.3 4.8v9.6L12 21.6l-8.3-4.8V7.2z" fill="rgba(255,226,150,0.18)" stroke="#ffe39a" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7.6l3.8 2.2v4.4L12 16.4l-3.8-2.2V9.8z" fill="#bff6ff" fill-opacity="0.55"/><circle cx="12" cy="12" r="2" fill="#fff"/></svg>';
