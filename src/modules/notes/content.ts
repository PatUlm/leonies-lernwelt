/**
 * Note values as Leonie drew them for this module: whole, half, quarter and
 * eighth notes, stems up, eighths with a flag each (no beams), no staff and
 * no rests. A beat is a quarter; lengths are counted in eighths, so half a
 * beat stays a whole number.
 */
export type Value = 'e' | 'q' | 'h' | 'w';
export const VALUES: readonly Value[] = ['e', 'q', 'h', 'w'];

/** Length in eighths: a beat is two. */
export const EIGHTHS: Record<Value, number> = { e: 1, q: 2, h: 4, w: 8 };
/** Eighths in a 4/4 bar. */
export const BAR_EIGHTHS = 8;

export const NAMES: Record<Value, string> = {
  e: 'Achtelnote',
  q: 'Viertelnote',
  h: 'halbe Note',
  w: 'ganze Note',
};

/** The length on an answer card. */
export const LENGTH_LABELS: Record<Value, string> = {
  e: 'halber Schlag',
  q: '1 Schlag',
  h: '2 Schläge',
  w: '4 Schläge',
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

/** Notes written as a string, e.g. "eeq". */
export function parseNotes(code: string): Value[] | null {
  const notes = [...code];
  return notes.length > 0 && notes.every(isValue) && onBeat(notes) ? notes : null;
}

/** Building blocks of groups and bars, one or two beats long: an eighth never comes alone. */
export type Block = readonly Value[];
const BLOCKS: readonly Block[] = [['q'], ['e', 'e'], ['h']];

/** Every row of blocks `beats` beats long with at most `maxNotes` notes. */
export function blockRows(beats: number, maxNotes: number): Block[][] {
  const out: Block[][] = [];
  const grow = (row: Block[], notes: number, left: number) => {
    if (left === 0) {
      out.push(row);
      return;
    }
    for (const block of BLOCKS) {
      const len = lengthOf(block);
      if (len <= left && notes + block.length <= maxNotes) grow([...row, block], notes + block.length, left - len);
    }
  };
  grow([], 0, beats * 2);
  return out;
}

/** "Was dauert genauso lang?": a single note to match with a group of two to four notes. */
export type Target = 'q' | 'h' | 'w';
export const TARGETS: readonly Target[] = ['q', 'h', 'w'];
export const GROUP_MAX_NOTES = 4;

export function isTarget(v: string): v is Target {
  return (TARGETS as readonly string[]).includes(v);
}

/** Groups of `beats` beats: at least two notes (the whole note only ever stands alone). */
export function groupsOf(beats: number): Value[][] {
  return blockRows(beats, GROUP_MAX_NOTES).map((row) => row.flat()).filter((g) => g.length >= 2);
}

/** Lengths of the groups that do not fit, in beats: one shorter and one longer, for a quarter the next two. */
export const WRONG_GROUP_BEATS: Record<Target, readonly [number, number]> = {
  q: [2, 3],
  h: [1, 3],
  w: [3, 5],
};

/** A 4/4 bar with one note missing (`gap` its index); the gap is a quarter or a half. */
export interface Bar {
  notes: Value[];
  gap: number;
}

export function gapValue(bar: Bar): Value {
  return bar.notes[bar.gap];
}

/** "hq_": the notes with "_" at the gap. */
export function barCode(bar: Bar): string {
  return bar.notes.map((v, i) => (i === bar.gap ? '_' : v)).join('');
}

/** The missing note follows from the rest: what is left of four beats. */
export function parseBar(code: string): Bar | null {
  const gap = code.indexOf('_');
  if (gap < 0 || code.indexOf('_', gap + 1) >= 0) return null;
  const rest = [...code.replace('_', '')];
  if (!rest.every(isValue)) return null;
  const missing = BAR_EIGHTHS - lengthOf(rest as Value[]);
  const value = missing === 2 ? 'q' : missing === 4 ? 'h' : null;
  if (!value) return null;
  const notes = [...code].map((c) => (c === '_' ? value : c)) as Value[];
  return onBeat(notes) ? { notes, gap } : null;
}
