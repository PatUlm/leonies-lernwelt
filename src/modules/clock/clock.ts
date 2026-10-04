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

export class AnalogClock {
  readonly svg: SVGSVGElement;
  private readonly hourHand: SVGGElement;
  private readonly minuteHand: SVGGElement;
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
    el('circle', { r: 5, class: 'clock-pin' }, this.svg);
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
