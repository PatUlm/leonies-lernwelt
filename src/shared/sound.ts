/** Short, soft feedback tones. No error sound by design. */
export class Sound {
  private ctx: AudioContext | null = null;

  constructor(public enabled: boolean) {}

  private context(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, start: number, duration: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  correct(): void {
    this.tone(784, 0, 0.18);
    this.tone(1047, 0.12, 0.25);
  }

  star(): void {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25 + i * 0.1, 0.3));
  }
}
