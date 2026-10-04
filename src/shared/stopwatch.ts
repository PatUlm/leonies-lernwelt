/**
 * Measures active time only: it pauses for as long as any reason (hidden tab,
 * open dialog, read-aloud) is active.
 */
export class Stopwatch {
  private elapsed = 0;
  private since: number | null = null;
  private readonly pauses = new Set<string>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Starts from zero; `paused` reasons that already apply (e.g. a hidden tab). */
  restart(paused: string[] = []): void {
    this.elapsed = 0;
    this.pauses.clear();
    for (const reason of paused) this.pauses.add(reason);
    this.since = this.pauses.size ? null : this.now();
  }

  pause(reason: string): void {
    if (this.since !== null) {
      this.elapsed += this.now() - this.since;
      this.since = null;
    }
    this.pauses.add(reason);
  }

  resume(reason: string): void {
    this.pauses.delete(reason);
    if (this.pauses.size === 0 && this.since === null) this.since = this.now();
  }

  read(): number {
    return this.elapsed + (this.since !== null ? this.now() - this.since : 0);
  }
}
