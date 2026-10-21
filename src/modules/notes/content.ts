/**
 * Note values as Leonie drew them for this module: half, quarter and eighth
 * notes, stems up, eighths with a flag each (no beams), no staff and no
 * rests. The whole note and four beats come later. A beat is a quarter;
 * lengths are counted in eighths, so half a beat stays a whole number.
 */
export type Value = 'e' | 'q' | 'h';
export const VALUES: readonly Value[] = ['e', 'q', 'h'];

/** Length in eighths: a beat is two. */
export const EIGHTHS: Record<Value, number> = { e: 1, q: 2, h: 4 };
/** "Zwei Schläge": what the notes of a row add up to, as on her sheet. */
export const ROW_BEATS = 2;
export const ROW_EIGHTHS = ROW_BEATS * 2;

export const NAMES: Record<Value, string> = {
  e: 'Achtelnote',
  q: 'Viertelnote',
  h: 'halbe Note',
};

/** The length on an answer card. */
export const LENGTH_LABELS: Record<Value, string> = {
  e: 'halber Schlag',
  q: '1 Schlag',
  h: '2 Schläge',
};

export function isValue(v: string): v is Value {
  return (VALUES as readonly string[]).includes(v);
}

/** Length of a sequence of notes, in eighths. */
export function lengthOf(notes: readonly Value[]): number {
  return notes.reduce((sum, v) => sum + EIGHTHS[v], 0);
}

/** Eighths come in pairs on the beat, as on her sheet: "eqe" (syncopated) is not written. */
export function onBeat(notes: readonly Value[]): boolean {
  let at = 0;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i] === 'e') {
      if (at % 2 === 0 && notes[i + 1] !== 'e') return false;
    } else if (at % 2 !== 0) {
      return false;
    }
    at += EIGHTHS[notes[i]];
  }
  return at % 2 === 0;
}

/** Building blocks of a row, one or two beats long: an eighth never comes alone. */
type Block = readonly Value[];
const BLOCKS: readonly Block[] = [['q'], ['e', 'e'], ['h']];

/** Every row of blocks `beats` beats long, as notes. */
export function rowsOf(beats: number): Value[][] {
  const out: Value[][] = [];
  const grow = (row: Value[], left: number) => {
    if (left === 0) {
      out.push(row);
      return;
    }
    for (const block of BLOCKS) {
      if (lengthOf(block) <= left) grow([...row, ...block], left - lengthOf(block));
    }
  };
  grow([], beats * 2);
  return out;
}

/** Notes of two beats with one note missing (`gap` its index). */
export interface Row {
  notes: Value[];
  gap: number;
}

export function gapValue(row: Row): Value {
  return row.notes[row.gap];
}

/** "qe_": the notes with "_" at the gap. */
export function rowCode(row: Row): string {
  return row.notes.map((v, i) => (i === row.gap ? '_' : v)).join('');
}

/** The missing note follows from the rest: what is left of two beats. "_" alone is a half note. */
export function parseRow(code: string): Row | null {
  const gap = code.indexOf('_');
  if (gap < 0 || code.indexOf('_', gap + 1) >= 0) return null;
  const rest = [...code.replace('_', '')];
  if (!rest.every(isValue)) return null;
  const missing = ROW_EIGHTHS - lengthOf(rest as Value[]);
  const value = VALUES.find((v) => EIGHTHS[v] === missing);
  if (!value) return null;
  const notes = [...code].map((c) => (c === '_' ? value : c)) as Value[];
  return onBeat(notes) ? { notes, gap } : null;
}

/** Every row of two beats with one gap: "q_", "e_q", "_" … */
export function rowCodes(): string[] {
  const codes = rowsOf(ROW_BEATS).flatMap((notes) => notes.map((_, gap) => rowCode({ notes, gap })));
  return [...new Set(codes)];
}

/** All notes of a row once the gap is filled with `value`. */
export function filledRow(row: Row, value: Value): Value[] {
  return row.notes.map((v, i) => (i === row.gap ? value : v));
}
