/**
 * The sweets that stand for the learning areas. Same 100×100 canvas and a dark
 * outline for all, so they read as one family; each keeps its fixed colour.
 */
const OUTLINE = '#1e3a5f';

export function lollipopCandy(color: string): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect x="46" y="62" width="8" height="35" rx="4" fill="#f5e6c8" stroke="${OUTLINE}" stroke-width="3"/>
    <circle cx="50" cy="38" r="31" fill="${color}" stroke="${OUTLINE}" stroke-width="4"/>
    <path d="M50 38m-5 0a5 5 0 1 1 10 0a10 10 0 1 1-20 0a15 15 0 1 1 30 0a20 20 0 1 1-40 0a25 25 0 1 1 50 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>
  </svg>`;
}

export function wrappedCandy(color: string): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M30 50 6 30l5 20-5 20ZM70 50l24-20-5 20 5 20Z" fill="${color}" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="50" cy="50" rx="26" ry="21" fill="${color}" stroke="${OUTLINE}" stroke-width="4"/>
    <path d="M38 34l8 32M52 30l8 34" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

export function cupcakeCandy(color: string): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M22 52h56l-8 42H30Z" fill="#fde7c3" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M34 54l3 38M46 54v38M58 54l-2 38M68 54l-4 38" stroke="#e8c68f" stroke-width="3"/>
    <path d="M16 54c-6-14 8-22 14-19 0-15 18-21 26-11 9-9 29-3 26 11 10 1 10 16 0 19Z" fill="${color}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="52" cy="17" r="7" fill="#ef4444" stroke="${OUTLINE}" stroke-width="3"/>
    <g stroke-width="4" stroke-linecap="round"><path d="M32 40l5 2" stroke="#fde047"/><path d="M55 34l5-2" stroke="#fff"/><path d="M66 44l3 4" stroke="#fde047"/></g>
  </svg>`;
}

export function gummyBear(color: string): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g fill="${color}" stroke="${OUTLINE}" stroke-width="3.5">
      <circle cx="34" cy="14" r="8"/><circle cx="66" cy="14" r="8"/>
      <circle cx="26" cy="54" r="9"/><circle cx="74" cy="54" r="9"/>
      <circle cx="34" cy="88" r="10"/><circle cx="66" cy="88" r="10"/>
      <ellipse cx="50" cy="66" rx="25" ry="26"/>
      <circle cx="50" cy="30" r="21"/>
    </g>
    <ellipse cx="50" cy="68" rx="13" ry="14" fill="#fff" opacity=".35"/>
    <circle cx="43" cy="27" r="3" fill="${OUTLINE}"/><circle cx="57" cy="27" r="3" fill="${OUTLINE}"/>
    <ellipse cx="50" cy="35" rx="5" ry="3.5" fill="${OUTLINE}"/>
  </svg>`;
}

export function chocolateBar(color: string): string {
  const pieces = [0, 1, 2]
    .flatMap((row) => [0, 1].map((col) => `<rect x="${30 + col * 21}" y="${16 + row * 22}" width="17" height="18" rx="3" fill="#fff" opacity=".22"/>`))
    .join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect x="25" y="10" width="50" height="72" rx="6" fill="${color}" stroke="${OUTLINE}" stroke-width="4"/>
    ${pieces}
    <path d="M22 58h56v30a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6Z" fill="#f472b6" stroke="${OUTLINE}" stroke-width="4"/>
    <path d="M22 58l8 6 8-6 8 6 8-6 8 6 8-6 8 6" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="78" r="7" fill="#fde047" stroke="${OUTLINE}" stroke-width="2.5"/>
  </svg>`;
}

/** Small status icons for the badges (never colour alone). */
export const STATUS_ICONS = {
  next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h11M10 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  new: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1l2.2 6.8L19 10l-6.8 2.2L10 19l-2.2-6.8L1 10l6.8-2.2Z" fill="currentColor"/></svg>',
  secure: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10.5l4.5 4.5L17 5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  soon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 15a4 4 0 0 1-.4-8 5 5 0 0 1 9.6 1.5A3.3 3.3 0 0 1 14.5 15Z" fill="currentColor"/></svg>',
} as const;
