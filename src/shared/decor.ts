/** Playful SVG pictures: clouds, stars and sweets. Pure decoration (aria-hidden). */

export function star(color = '#fcd34d', edge = '#f59e0b'): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 5 63 36 97 38 71 60 79 94 50 76 21 94 29 60 3 38 37 36Z" fill="${color}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/><circle cx="40" cy="50" r="4" fill="#7c2d12"/><circle cx="60" cy="50" r="4" fill="#7c2d12"/><path d="M42 62q8 7 16 0" fill="none" stroke="#7c2d12" stroke-width="3.5" stroke-linecap="round"/></svg>`;
}

export function plainStar(color = '#fde68a'): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 5 63 36 97 38 71 60 79 94 50 76 21 94 29 60 3 38 37 36Z" fill="${color}" stroke-linejoin="round"/></svg>`;
}

export function cloud(): string {
  return `<svg viewBox="0 0 200 110" aria-hidden="true"><g fill="#fff"><circle cx="60" cy="65" r="38"/><circle cx="105" cy="48" r="44"/><circle cx="150" cy="68" r="32"/><rect x="30" y="66" width="145" height="36" rx="18"/></g><path d="M34 92h138" stroke="#dbeafe" stroke-width="10" stroke-linecap="round"/></svg>`;
}

export function lollipop(a = '#f472b6', b = '#fff'): string {
  return `<svg viewBox="0 0 100 160" aria-hidden="true"><rect x="46" y="80" width="8" height="78" rx="4" fill="#e7d3b0"/><circle cx="50" cy="50" r="44" fill="${a}"/><path d="M50 50m-6 0a6 6 0 1 1 12 0a12 12 0 1 1-24 0a18 18 0 1 1 36 0a24 24 0 1 1-48 0a30 30 0 1 1 60 0a36 36 0 1 1-72 0" fill="none" stroke="${b}" stroke-width="6" stroke-linecap="round"/></svg>`;
}

export function candy(color = '#a78bfa', stripe = '#fff'): string {
  return `<svg viewBox="0 0 160 80" aria-hidden="true"><path d="M44 40 6 12 14 40 6 68Z M116 40 154 12 146 40 154 68Z" fill="${color}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><ellipse cx="80" cy="40" rx="40" ry="28" fill="${color}"/><path d="M58 18 70 62M78 13 90 66M98 18 108 58" stroke="${stripe}" stroke-width="6" stroke-linecap="round" opacity=".7"/></svg>`;
}

export function cupcake(): string {
  return `<svg viewBox="0 0 100 110" aria-hidden="true"><path d="M18 58h64l-9 46H27Z" fill="#fb923c"/><path d="M30 60l4 42M46 60v42M60 60l-3 42M72 60l-5 42" stroke="#fdba74" stroke-width="4"/><path d="M12 60c-6-18 12-26 18-22 0-16 20-24 30-12 10-10 32-2 28 14 10 0 12 14 0 20Z" fill="#fbcfe8"/><circle cx="52" cy="18" r="8" fill="#ef4444"/><g fill="#60a5fa"><rect x="30" y="44" width="8" height="3" rx="1.5" transform="rotate(30 34 45)"/><rect x="58" y="36" width="8" height="3" rx="1.5" transform="rotate(-20 62 37)"/></g><g fill="#facc15"><rect x="44" y="50" width="8" height="3" rx="1.5"/><rect x="70" y="48" width="8" height="3" rx="1.5" transform="rotate(50 74 49)"/></g></svg>`;
}

export function trophy(): string {
  return `<svg viewBox="0 0 120 130" aria-hidden="true"><path d="M30 14c-30 0-26 40 6 42M90 14c30 0 26 40-6 42" fill="none" stroke="#f59e0b" stroke-width="9"/><path d="M28 8h64v28c0 22-14 36-32 36S28 58 28 36Z" fill="#fbbf24" stroke="#d97706" stroke-width="4"/><path d="M42 18v18c0 8 4 14 10 18" fill="none" stroke="#fef3c7" stroke-width="6" stroke-linecap="round"/><rect x="52" y="70" width="16" height="22" fill="#f59e0b"/><rect x="34" y="92" width="52" height="14" rx="4" fill="#d97706"/><rect x="26" y="106" width="68" height="18" rx="5" fill="#92400e"/><path d="M60 26l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="#fff7d6"/></svg>`;
}

export function medal(): string {
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M30 4h18l10 40H40ZM70 4H52L42 44h18Z" fill="#60a5fa"/><path d="M48 4h4l-2 40Z" fill="#f472b6"/><circle cx="50" cy="76" r="38" fill="#fbbf24" stroke="#d97706" stroke-width="5"/><circle cx="50" cy="76" r="26" fill="#fcd34d"/><path d="M50 58l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" fill="#fff7d6"/></svg>`;
}

/** Afternoon on the playground: sun, swing and grass (context for afternoon times). */
export function afternoonScene(): string {
  return `<svg viewBox="0 0 120 80" aria-hidden="true">
    <rect x="0" y="0" width="120" height="80" rx="14" fill="#dbeafe"/>
    <g stroke="#f59e0b" stroke-width="4" stroke-linecap="round">
      <path d="M30 6v6M30 42v6M10 27h6M44 27h6M16 13l4 4M40 37l4 4M44 13l-4 4M20 37l-4 4"/>
    </g>
    <circle cx="30" cy="27" r="11" fill="#fcd34d" stroke="#f59e0b" stroke-width="3"/>
    <path d="M0 62q30-8 60-2t60-2v8a14 14 0 0 1-14 14H14A14 14 0 0 1 0 66Z" fill="#86efac"/>
    <path d="M66 70 78 22h22l12 48" fill="none" stroke="#b45309" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M84 24v26M95 24v26" stroke="#57534e" stroke-width="2.5"/>
    <rect x="80" y="49" width="19" height="6" rx="3" fill="#ef4444"/>
  </svg>`;
}

/** Decorative sky layer behind the content: clouds, twinkling stars and sweets at the edges. */
export function skyLayer(variant: 'dashboard' | 'game'): string {
  const twinkle = (x: string, y: string, size: number, delay: number) =>
    `<span class="deco twinkle" style="left:${x};top:${y};width:${size}px;animation-delay:${delay}s">${plainStar()}</span>`;
  const item = (cls: string, x: string, y: string, size: number, svg: string, rot = 0) =>
    `<span class="deco ${cls}" style="left:${x};top:${y};width:${size}px;rotate:${rot}deg">${svg}</span>`;

  const common = [
    item('drift', '-4%', '6%', 170, cloud()),
    item('drift slow', '80%', '9%', 130, cloud()),
    twinkle('22%', '4%', 22, 0),
    twinkle('88%', '18%', 18, 1.2),
    twinkle('6%', '40%', 16, 0.6),
  ];
  const extra =
    variant === 'dashboard'
      ? [
          item('drift', '78%', '60%', 190, cloud()),
          item('bob', '86%', '78%', 70, lollipop()),
          item('bob late', '4%', '80%', 90, candy()),
          item('bob', '90%', '44%', 60, cupcake(), 8),
          twinkle('60%', '90%', 20, 0.9),
          twinkle('40%', '70%', 14, 1.6),
        ]
      : [
          item('bob', '2%', '84%', 56, lollipop('#60a5fa')),
          item('bob late', '91%', '86%', 70, candy('#f472b6')),
          twinkle('94%', '60%', 16, 0.3),
        ];
  return `<div class="sky" aria-hidden="true">${[...common, ...extra].join('')}</div>`;
}

/** Sweets and stars raining down for about two seconds. */
export function confetti(container: HTMLElement): void {
  const pieces = [star(), plainStar('#f9a8d4'), candy(), candy('#34d399'), lollipop(), lollipop('#fbbf24'), plainStar('#93c5fd')];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.innerHTML = pieces[i % pieces.length];
    p.style.left = `${Math.random() * 96}%`;
    p.style.width = `${28 + Math.random() * 26}px`;
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    layer.appendChild(p);
  }
  container.appendChild(layer);
  window.setTimeout(() => layer.remove(), 2600);
}
