import { EIGHTHS, type Value } from './content';

/**
 * "Anhören": the notes as held tones over a soft click on every beat, after
 * two clicks to count in. A gap is silence while the clicks go on. It plays
 * whenever she asks, also with the feedback tones switched off: the sound is
 * the lesson here, not a reward.
 */

/** Seconds per beat: 75 beats a minute, slow enough to count along. */
export const BEAT_S = 0.8;
const COUNT_IN = 2;
const TONE_HZ = 523.25;
/** Each note ends a little early, so two notes in a row are heard as two. */
const RELEASE_S = 0.09;

export interface PlayNote {
  value: Value;
  /** A gap: silence for its length. */
  silent?: boolean;
}

export class RhythmPlayer {
  private ctx: AudioContext | null = null;
  private timers: number[] = [];
  private nodes: AudioScheduledSourceNode[] = [];
  private onEnd: (() => void) | null = null;
  /** Waiting for the end of what is playing, see whenDone(). */
  private waiting: (() => void)[] = [];

  private context(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  get playing(): boolean {
    return this.onEnd !== null;
  }

  /** `onNote` reports the note being heard, -1 when done or stopped. */
  play(notes: readonly PlayNote[], onNote: (index: number) => void): void {
    this.stop();
    const ctx = this.context();
    if (!ctx) {
      onNote(-1);
      return;
    }
    const t0 = ctx.currentTime + 0.1;
    const total = notes.reduce((sum, n) => sum + EIGHTHS[n.value], 0) / 2;
    for (let b = 0; b < COUNT_IN + Math.ceil(total); b++) this.click(ctx, t0 + b * BEAT_S, b < COUNT_IN);
    let at = t0 + COUNT_IN * BEAT_S;
    notes.forEach((note, i) => {
      const length = (EIGHTHS[note.value] / 2) * BEAT_S;
      if (!note.silent) this.tone(ctx, at, length);
      this.later(() => onNote(i), at - ctx.currentTime);
      at += length;
    });
    this.onEnd = () => onNote(-1);
    this.later(() => this.finish(), at - ctx.currentTime + 0.1);
  }

  stop(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.nodes = [];
    this.finish();
  }

  /** Runs `fn` now, or once the notes have been played (or stopped): moving on never cuts them off. */
  whenDone(fn: () => void): void {
    if (this.playing) this.waiting.push(fn);
    else fn();
  }

  /** Drops whatever waits for the end, e.g. on a new task. */
  forget(): void {
    this.waiting = [];
  }

  dispose(): void {
    this.forget();
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private finish(): void {
    const end = this.onEnd;
    this.onEnd = null;
    end?.();
    const waiting = this.waiting;
    this.waiting = [];
    for (const fn of waiting) fn();
  }

  private later(fn: () => void, seconds: number): void {
    this.timers.push(window.setTimeout(fn, Math.max(0, seconds * 1000)));
  }

  private click(ctx: AudioContext, t: number, countIn: boolean): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = countIn ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(countIn ? 0.06 : 0.035, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
    this.nodes.push(osc);
  }

  private tone(ctx: AudioContext, t: number, length: number): void {
    const end = t + Math.max(0.12, length - RELEASE_S);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = TONE_HZ;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.setValueAtTime(0.18, t + 0.08);
    gain.gain.setValueAtTime(0.18, end - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(end + 0.02);
    this.nodes.push(osc);
  }
}
