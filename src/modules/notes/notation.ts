import { EIGHTHS, NAMES, type Value } from './content';

/**
 * Notes drawn as on Leonie's sheet: stems up, every eighth with its own flag,
 * no staff. Below a note its length can stand as fields: one cell per half
 * beat, a dashed line inside a beat, a solid one between beats. Strokes use
 * currentColor, so a note being played can change colour.
 */

const SLOT = 40;
const CELL = 22;
const SPACE = 8;
const HEAD_Y = 74;
const NOTE_H = 96;
const FIELD_TOP = NOTE_H + 6;
const FIELD_H = 22;
const WITH_FIELDS_H = FIELD_TOP + FIELD_H + 4;
const GAP_W = 50;

/** One note centred on `x`. */
function glyph(value: Value, x: number): string {
  const hollow = value === 'h';
  const hx = x - 4;
  const stemX = hx + 9.3;
  const head = `<ellipse cx="${hx}" cy="${HEAD_Y}" rx="10.5" ry="7.5" transform="rotate(-22 ${hx} ${HEAD_Y})"
    ${hollow ? 'fill="var(--card, #fff)" stroke="currentColor" stroke-width="3.2"' : 'fill="currentColor"'}/>`;
  const stem = `<line x1="${stemX}" y1="${HEAD_Y - 2}" x2="${stemX}" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`;
  const flag = value === 'e'
    ? `<path d="M${stemX} 14c1.5 9 13 12 10.5 27" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`
    : '';
  return head + stem + flag;
}

/** The fields of one note: a bar of its length with a line per half beat. */
function noteFields(value: Value, x: number): string {
  const n = EIGHTHS[value];
  const w = n * CELL;
  const left = x - w / 2;
  const lines = Array.from({ length: n - 1 }, (_, i) => {
    const lx = left + (i + 1) * CELL;
    const beat = (i + 1) % 2 === 0;
    return `<line x1="${lx}" y1="${FIELD_TOP + 3}" x2="${lx}" y2="${FIELD_TOP + FIELD_H - 3}" stroke="#fff" stroke-width="${beat ? 3 : 1.6}"${beat ? '' : ' stroke-dasharray="3 3"'}/>`;
  }).join('');
  return `<rect class="field" x="${left + 1}" y="${FIELD_TOP}" width="${w - 2}" height="${FIELD_H}" rx="6"/>${lines}`;
}

/** The empty fields under a gap: as long as the missing note, only outlined. */
function gapFields(value: Value, x: number): string {
  const w = EIGHTHS[value] * CELL;
  const left = x - w / 2;
  const lines = Array.from({ length: EIGHTHS[value] - 1 }, (_, i) => {
    const lx = left + (i + 1) * CELL;
    const beat = (i + 1) % 2 === 0;
    return `<line x1="${lx}" y1="${FIELD_TOP + 3}" x2="${lx}" y2="${FIELD_TOP + FIELD_H - 3}" stroke="currentColor" stroke-width="${beat ? 2.4 : 1.6}" opacity="0.55"${beat ? '' : ' stroke-dasharray="3 3"'}/>`;
  }).join('');
  return `<rect class="empty-field" x="${left + 1}" y="${FIELD_TOP}" width="${w - 2}" height="${FIELD_H}" rx="6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="5 4" opacity="0.7"/>${lines}`;
}

function slotWidth(value: Value, isGap: boolean, fields: boolean): number {
  const base = isGap ? GAP_W : SLOT;
  return fields ? Math.max(base, EIGHTHS[value] * CELL) : base;
}

export interface RowOptions {
  /** The fields under the notes. */
  fields?: boolean;
  /** Index of a missing note: a box with "?", with fields its length as empty fields. */
  gap?: number | null;
  /** Index of the note just put into the gap: drawn in green. */
  filled?: number | null;
  /** Extra class on the svg, e.g. for the size. */
  className?: string;
}

/**
 * A row of notes. Without fields every note takes the same room, so the
 * spacing never gives a length away. With fields the gap shows how much is
 * missing, as on her sheet: the empty part of two beats.
 */
export function notesSvg(notes: readonly Value[], options: RowOptions = {}): string {
  const { fields = false, gap = null, filled = null, className = '' } = options;
  const widths = notes.map((v, i) => slotWidth(v, i === gap, fields));
  let x = 0;
  const parts: string[] = [];
  notes.forEach((v, i) => {
    const centre = x + widths[i] / 2;
    if (i === gap) {
      parts.push(`<g class="note gap-box" data-note="${i}">
        <rect x="${centre - GAP_W / 2 + 2}" y="${HEAD_Y - 30}" width="${GAP_W - 4}" height="44" rx="10" fill="var(--card, #fff)" stroke="var(--accent, #f59e0b)" stroke-width="3" stroke-dasharray="6 5"/>
        <text x="${centre}" y="${HEAD_Y + 3}" text-anchor="middle" font-size="30" font-weight="800" fill="var(--accent, #f59e0b)">?</text>
        ${fields ? gapFields(v, centre) : ''}
      </g>`);
    } else {
      parts.push(`<g class="note${i === filled ? ' filled' : ''}" data-note="${i}">${glyph(v, centre)}${fields ? noteFields(v, centre) : ''}</g>`);
    }
    x += widths[i] + (i < notes.length - 1 ? SPACE : 0);
  });
  const height = fields ? WITH_FIELDS_H : NOTE_H;
  return `<svg class="notes-svg ${className}" viewBox="-2 0 ${x + 4} ${height}" width="${x + 4}" height="${height}" aria-hidden="true">${parts.join('')}</svg>`;
}

/**
 * A length without a note: whole beats as boxes, each in two halves, filled
 * as far as the note lasts. Half a beat fills half a box. `room`: beats of
 * room, centred; answers side by side all get the room of the longest, so
 * they shrink alike in a narrow column and two beats never look shorter
 * than one.
 */
export function lengthSvg(value: Value, className = '', room = 0): string {
  const n = EIGHTHS[value];
  const beats = Math.ceil(n / 2);
  const box = CELL * 2;
  const h = 34;
  const span = (count: number) => count * box + (count - 1) * 6;
  const offset = (span(Math.max(beats, room)) - span(beats)) / 2;
  const boxes = Array.from({ length: beats }, (_, b) => {
    const x = offset + b * (box + 6);
    const filled = Math.min(2, n - b * 2);
    return `<rect x="${x}" y="2" width="${box}" height="${h}" rx="8" fill="var(--card, #fff)" stroke="currentColor" stroke-width="2.4"/>
      <rect class="field" x="${x + 3}" y="5" width="${filled * CELL - (filled === 2 ? 6 : 3)}" height="${h - 6}" rx="5"/>
      <line x1="${x + CELL}" y1="6" x2="${x + CELL}" y2="${h - 2}" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.55"/>`;
  }).join('');
  const w = span(Math.max(beats, room));
  return `<svg class="length-svg ${className}" viewBox="-2 0 ${w + 4} ${h + 4}" width="${w + 4}" height="${h + 4}" aria-hidden="true">${boxes}</svg>`;
}

/** "Achtelnote, Achtelnote, Viertelnote" for a screen reader. */
export function notesLabel(notes: readonly Value[]): string {
  return notes.map((v) => NAMES[v][0].toUpperCase() + NAMES[v].slice(1)).join(', ');
}
