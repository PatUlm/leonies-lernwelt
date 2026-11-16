import { escapeHtml } from '../../shared/html';
import type { Part } from './content';

/**
 * One deciduous tree with the ground cut open, as on the sheet "Teile eines
 * Laubbaumes". One part can be marked: it keeps its colours and gets a blue
 * outline, the rest fades, and a line with a dot leads to a box as on the
 * sheet – empty ("?") while asked, with the name once known. Exactly one
 * branch, twig, leaf and fruit belongs to the part of that name; the others
 * are just tree.
 */

const BARK = '#7a4a26';
const WOOD = '#e9c99a';
const BRANCH = '#8d5a32';
const LEAF = '#5fb35f';
const LEAF_EDGE = '#2e7d32';
const MARK = '#2563eb';

/** Every shape of the drawing, back to front, with the parts it belongs to. */
interface Shape {
  svg: string;
  /** Marked with these parts: full colour. */
  parts: readonly Part[];
  /** Outlined in blue when this part is marked. */
  outline?: readonly Part[];
}

function leaf(x: number, y: number, angle: number, size = 1): string {
  return `<path d="M0 0c7-9 19-9 26 0c-7 9-19 9-26 0Z M2 0H22" transform="translate(${x} ${y}) rotate(${angle}) scale(${size})" fill="${LEAF}" stroke="${LEAF_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function fruit(x: number, y: number): string {
  return `<path d="M${x} ${y - 13}v6" stroke="${BRANCH}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="${x}" cy="${y}" r="8" fill="#e0533a" stroke="#8e2a17" stroke-width="1.6"/>` +
    `<circle cx="${x - 2.5}" cy="${y - 2.5}" r="2" fill="#fff" opacity="0.7"/>`;
}

function stroke(d: string, width: number, color = BRANCH): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

const CROWN_PARTS: readonly Part[] = ['krone'];

/** The tree, centred at x = 180 in a 360 × 270 box. */
const SHAPES: readonly Shape[] = [
  // Soil cut open, grass on top.
  { svg: `<rect x="0" y="188" width="360" height="82" fill="#ecdcc0"/><path d="M0 188H360" stroke="#7cb342" stroke-width="6"/>`, parts: [] },
  {
    svg: `<path d="M86 104C64 96 62 66 84 58C82 32 112 16 136 26C150 6 196 4 212 22C236 12 270 28 270 50C294 58 300 92 278 106C266 122 236 122 224 112C202 124 160 124 140 112C122 124 96 120 86 104Z" fill="#d7edcf" stroke="#9ccc8f" stroke-width="2.5"/>`,
    parts: CROWN_PARTS,
    outline: ['krone'],
  },
  {
    svg: [
      stroke('M166 192C154 208 132 216 104 224', 9), stroke('M174 194C168 214 160 230 152 250', 8),
      stroke('M186 194C192 214 200 230 210 248', 8), stroke('M194 192C208 208 228 214 256 220', 9),
      stroke('M128 216C120 224 110 232 98 238', 4), stroke('M232 216C240 222 248 228 256 232', 4),
    ].join(''),
    parts: ['wurzeln'],
    outline: ['wurzeln'],
  },
  // Branches: the right one is "der Ast".
  { svg: stroke('M174 120C160 102 142 90 120 78', 12) + stroke('M180 116V58', 12), parts: CROWN_PARTS },
  { svg: stroke('M186 120C202 102 220 92 242 82', 12), parts: ['krone', 'ast'], outline: ['ast'] },
  // Twigs: the upper left one is "der Zweig".
  {
    svg: [
      stroke('M122 79C110 74 98 70 86 68', 5), stroke('M136 88C132 78 128 68 124 54', 5),
      stroke('M180 62C172 50 164 42 154 36', 5), stroke('M180 70C190 58 200 48 212 36', 5),
      stroke('M240 83C250 76 260 70 270 64', 5), stroke('M240 83C242 70 246 60 252 48', 5),
      stroke('M222 94C228 86 232 78 234 70', 5), stroke('M180 62C182 48 186 38 194 26', 5),
    ].join(''),
    parts: CROWN_PARTS,
  },
  { svg: stroke('M122 79C118 66 114 56 106 44', 5), parts: ['krone', 'zweig'], outline: ['zweig'] },
  // Trunk: light wood where a little bark is missing, the bark around it.
  {
    svg: `<path d="M156 192C166 170 168 146 170 118H190C192 146 194 170 204 192Z" fill="${WOOD}"/>`,
    parts: ['stamm'],
    outline: ['stamm'],
  },
  {
    svg: `<path d="M156 192C166 170 168 146 170 118H190C192 146 194 170 204 192ZM179 146c-7 0-10 8-10 15s4 14 10 14s9-7 9-14s-3-15-9-15Z" fill="${BARK}" fill-rule="evenodd"/>` +
      stroke('M175 126v12M186 132v14M172 176v10M190 160v14M184 178v10M168 140v8', 2.5, '#4a2c14'),
    parts: ['stamm', 'rinde'],
    outline: ['rinde'],
  },
  {
    svg: [
      leaf(84, 64, -160), leaf(92, 46, -130), leaf(116, 46, -100), leaf(124, 34, -80), leaf(150, 30, -130),
      leaf(196, 22, -70), leaf(212, 32, -40), leaf(252, 44, -70), leaf(268, 60, -10), leaf(234, 66, -80),
      leaf(150, 72, -150), leaf(84, 82, 160), leaf(200, 48, -20),
    ].join(''),
    parts: CROWN_PARTS,
  },
  { svg: leaf(272, 70, 20, 1.25), parts: ['krone', 'blatt'], outline: ['blatt'] },
  { svg: fruit(214, 56) + fruit(156, 52), parts: CROWN_PARTS },
  { svg: fruit(104, 84), parts: ['krone', 'frucht'], outline: ['frucht'] },
];

/** Where the line starts on the part, and on which side its box stands. */
const POINTERS: Record<Part, { x: number; y: number; side: 'left' | 'right'; boxY: number }> = {
  wurzeln: { x: 236, y: 214, side: 'right', boxY: 252 },
  stamm: { x: 186, y: 150, side: 'right', boxY: 150 },
  rinde: { x: 166, y: 182, side: 'left', boxY: 182 },
  ast: { x: 222, y: 92, side: 'right', boxY: 112 },
  zweig: { x: 107, y: 46, side: 'left', boxY: 28 },
  blatt: { x: 302, y: 82, side: 'right', boxY: 22 },
  krone: { x: 90, y: 104, side: 'left', boxY: 132 },
  frucht: { x: 95, y: 87, side: 'left', boxY: 150 },
};

const BOX_W = 96;
const BOX_H = 30;

function pointer(part: Part, name: string | null): string {
  const p = POINTERS[part];
  const boxX = p.side === 'left' ? 4 : 360 - 4 - BOX_W;
  const endX = p.side === 'left' ? boxX + BOX_W : boxX;
  const text = name === null
    ? `<text x="${boxX + BOX_W / 2}" y="${p.boxY + 6}" text-anchor="middle" font-size="18" font-weight="800" fill="${MARK}">?</text>`
    : `<text x="${boxX + BOX_W / 2}" y="${p.boxY + 5}" text-anchor="middle" font-size="${name.length > 11 ? 12.5 : 14}" font-weight="700" fill="#1e3a5f">${escapeHtml(name)}</text>`;
  return `<g class="tree-pointer">
    <path d="M${p.x} ${p.y}L${endX} ${p.boxY}" stroke="${MARK}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${p.x}" cy="${p.y}" r="4" fill="${MARK}" stroke="#fff" stroke-width="1.5"/>
    <rect x="${boxX}" y="${p.boxY - BOX_H / 2}" width="${BOX_W}" height="${BOX_H}" rx="8" fill="#fff" stroke="${MARK}" stroke-width="2.5"/>
    ${text}
  </g>`;
}

/**
 * The tree; `mark` a part to outline and point at, `name` the text in its
 * box (null: "?"). Only one tree is on screen at a time, so the filter id is
 * unique.
 */
export function treeSvg(mark: Part | null, name: string | null = null): string {
  const body = SHAPES.map((s) => {
    // The ground (no part) stays: it shows where the roots are.
    if (mark === null || !s.parts.length) return s.svg;
    if (!s.parts.includes(mark)) return `<g opacity="0.3">${s.svg}</g>`;
    // The outline right behind its own shape, so nothing in between covers it.
    return s.outline?.includes(mark) ? `<g filter="url(#tree-halo)">${s.svg}</g>${s.svg}` : s.svg;
  });
  return `<svg class="tree-svg" viewBox="0 0 360 270" aria-hidden="true"${mark ? ` data-mark="${mark}"` : ''}>
    <defs><filter id="tree-halo" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology operator="dilate" radius="3.5" in="SourceAlpha" result="grown"/>
      <feFlood flood-color="${MARK}"/><feComposite in2="grown" operator="in"/>
    </filter></defs>
    ${body.join('')}
    ${mark ? pointer(mark, name) : ''}
  </svg>`;
}
