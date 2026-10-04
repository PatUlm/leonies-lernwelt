import type { ClockTime } from './time';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ClockHelpers {
  /** Minute numbers (05, 10, … 55) outside the dial. */
  minuteLabels: boolean;
  /** Tinted quarter sectors behind the dial. */
  quarters: boolean;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function polar(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

/** Hand angles in degrees, clockwise from 12. The hour hand moves continuously. */
export function handAngles(t: ClockTime): { hour: number; minute: number } {
  return {
    hour: ((t.hour % 12) + t.minute / 60) * 30,
    minute: t.minute * 6,
  };
}

/** Angle in degrees clockwise from 12 of a point relative to the centre. */
function angleOf(x: number, y: number): number {
  return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
}

/** Hour after dragging the hour hand to `angle`, keeping the minutes. */
export function hourFromAngle(angle: number, minute: number): number {
  const h = Math.round((angle - minute / 2) / 30);
  return ((h % 12) + 12) % 12 || 12;
}

/**
 * Dragging the minute hand to `angle`. `total` is the unsnapped position in
 * minutes since 12:00 (0–720); it runs on over the 12, so the hour hand moves
 * along like on a real clock. The shown time snaps to `step` minutes.
 */
export function minuteDrag(total: number, angle: number, step: number): { total: number; time: ClockTime } {
  const raw = angle / 6;
  const delta = ((raw - (total % 60) + 90) % 60) - 30; // shortest way, −30 … +30
  const next = (((total + delta) % 720) + 720) % 720;
  const snapped = (Math.round(next / step) * step) % 720;
  return { total: next, time: { hour: Math.floor(snapped / 60) || 12, minute: snapped % 60 } };
}

export class AnalogClock {
  readonly svg: SVGSVGElement;
  private readonly hourHand: SVGGElement;
  private readonly minuteHand: SVGGElement;
  /** Setting the hands: current time, snap step and change listener. */
  private setting: { time: ClockTime; total: number; step: number; onChange: (t: ClockTime) => void } | null = null;
  private dragging: 'hour' | 'minute' | null = null;
  private readonly minuteLabels: SVGGElement;
  private readonly quarters: SVGGElement;
  private readonly focusLayer: SVGGElement;

  constructor() {
    this.svg = el('svg', { viewBox: '-125 -125 250 250', class: 'clock', role: 'img' });

    this.quarters = el('g', { class: 'clock-quarters' }, this.svg);
    for (let q = 0; q < 4; q++) {
      const [x1, y1] = polar(q * 90, 92);
      const [x2, y2] = polar(q * 90 + 90, 92);
      el('path', { d: `M0 0 L${x1} ${y1} A92 92 0 0 1 ${x2} ${y2} Z`, class: `q q${q}` }, this.quarters);
    }

    el('circle', { r: 96, class: 'clock-rim' }, this.svg);
    el('circle', { r: 92, class: 'clock-face' }, this.svg);
    // Quarters and focus highlights sit on top of the face so they stay visible.
    this.svg.appendChild(this.quarters);
    this.focusLayer = el('g', { class: 'clock-focus' }, this.svg);

    const ticks = el('g', { class: 'clock-ticks' }, this.svg);
    for (let m = 0; m < 60; m++) {
      const major = m % 5 === 0;
      const [x1, y1] = polar(m * 6, major ? 80 : 85);
      const [x2, y2] = polar(m * 6, 90);
      el('line', { x1, y1, x2, y2, class: major ? 'tick major' : 'tick' }, ticks);
    }

    const numbers = el('g', { class: 'clock-numbers' }, this.svg);
    for (let h = 1; h <= 12; h++) {
      const [x, y] = polar(h * 30, 66);
      const text = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, numbers);
      text.textContent = String(h);
    }

    this.minuteLabels = el('g', { class: 'clock-minute-labels' }, this.svg);
    for (let m = 0; m < 60; m += 5) {
      const [x, y] = polar(m * 6, 110);
      const text = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.minuteLabels);
      text.textContent = String(m).padStart(2, '0');
    }

    this.hourHand = el('g', { class: 'hand hour-hand' }, this.svg);
    el('line', { x1: 0, y1: 10, x2: 0, y2: -46 }, this.hourHand);
    this.minuteHand = el('g', { class: 'hand minute-hand' }, this.svg);
    el('line', { x1: 0, y1: 14, x2: 0, y2: -78 }, this.minuteHand);
    // Grips for setting the hands: a visible knob and a larger invisible touch area.
    for (const [hand, y, name] of [[this.hourHand, -46, 'hour'], [this.minuteHand, -78, 'minute']] as const) {
      const grip = el('g', { class: `grip grip-${name}`, 'data-hand': name }, hand);
      el('circle', { cy: y, r: 24, class: 'grip-hit' }, grip);
      el('circle', { cy: y, r: 9, class: 'grip-knob' }, grip);
    }
    el('circle', { r: 5, class: 'clock-pin' }, this.svg);

    this.svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.svg.addEventListener(ev, () => {
        this.dragging = null;
        this.svg.classList.remove('dragging');
      });
    }
  }

  /** Lets the child set the hands, starting at `start`; minutes snap to `step`. */
  enableSetting(start: ClockTime, step: number, onChange: (t: ClockTime) => void = () => {}): void {
    this.setting = { time: { ...start }, total: (start.hour % 12) * 60 + start.minute, step, onChange };
    this.svg.classList.add('settable');
    // Full hours only: the minute hand stays on the 12.
    this.svg.classList.toggle('hour-only', step >= 60);
    this.setTime(start);
  }

  disableSetting(): void {
    this.setting = null;
    this.dragging = null;
    this.svg.classList.remove('settable', 'hour-only', 'dragging');
  }

  /** The time the child has set. */
  setTimeValue(): ClockTime | null {
    return this.setting ? { ...this.setting.time } : null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.setting) return;
    const grip = (e.target as Element).closest<SVGGElement>('[data-hand]');
    const hand = grip?.dataset.hand as 'hour' | 'minute' | undefined;
    if (!hand || (hand === 'minute' && this.setting.step >= 60)) return;
    e.preventDefault();
    this.dragging = hand;
    this.svg.classList.add('dragging');
    this.svg.setPointerCapture(e.pointerId);
    this.onPointerMove(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.setting || !this.dragging) return;
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const angle = angleOf(p.x, p.y);
    const prev = this.setting.time;
    let next: ClockTime;
    if (this.dragging === 'hour') {
      next = { hour: hourFromAngle(angle, prev.minute), minute: prev.minute };
      this.setting.total = (next.hour % 12) * 60 + next.minute;
    } else {
      const moved = minuteDrag(this.setting.total, angle, this.setting.step);
      this.setting.total = moved.total;
      next = moved.time;
    }
    if (next.hour === prev.hour && next.minute === prev.minute) return;
    this.setting.time = next;
    this.setTime(next);
    this.setting.onChange(next);
  }

  setTime(t: ClockTime): void {
    const { hour, minute } = handAngles(t);
    this.hourHand.setAttribute('transform', `rotate(${hour})`);
    this.minuteHand.setAttribute('transform', `rotate(${minute})`);
  }

  setHelpers(h: ClockHelpers): void {
    this.minuteLabels.style.display = h.minuteLabels ? '' : 'none';
    this.quarters.style.display = h.quarters ? '' : 'none';
  }

  /**
   * Visual focus for explanations: 'hour' tints the sector the hour hand is in,
   * 'minute' draws the arc the minute hand has travelled from the 12.
   */
  setFocus(focus: 'hour' | 'minute' | null, t?: ClockTime): void {
    this.focusLayer.replaceChildren();
    this.hourHand.classList.toggle('focused', focus === 'hour');
    this.minuteHand.classList.toggle('focused', focus === 'minute');
    if (!focus || !t) return;
    if (focus === 'hour') {
      const start = (t.hour % 12) * 30;
      const [x1, y1] = polar(start, 92);
      const [x2, y2] = polar(start + 30, 92);
      el('path', { d: `M0 0 L${x1} ${y1} A92 92 0 0 1 ${x2} ${y2} Z`, class: 'focus-hour' }, this.focusLayer);
    } else if (t.minute > 0) {
      const end = t.minute * 6;
      const [x1, y1] = polar(0, 86);
      const [x2, y2] = polar(end, 86);
      const large = end > 180 ? 1 : 0;
      el('path', { d: `M${x1} ${y1} A86 86 0 ${large} 1 ${x2} ${y2}`, class: 'focus-minute' }, this.focusLayer);
    }
  }
}
