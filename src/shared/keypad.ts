/**
 * Large on-screen number pad for children (no system keyboard on tablets):
 *   1 2 3 4 5 ⌫
 *   6 7 8 9 0 ✓
 */
export interface KeypadOptions {
  onDigit(d: number): void;
  onBackspace(): void;
  onSubmit(): void;
  submitLabel?: string;
  /** A wider right column, for a word on the submit key. */
  wideSubmit?: boolean;
}

export interface Keypad {
  element: HTMLElement;
  setSubmitEnabled(enabled: boolean): void;
  setSubmitLabel(label: string): void;
  /** Points to the submit key for a moment: it is the next step. */
  nudgeSubmit(): void;
  setDisabled(disabled: boolean): void;
}

export function createKeypad(opts: KeypadOptions): Keypad {
  const el = document.createElement('div');
  el.className = opts.wideSubmit ? 'keypad wide-submit' : 'keypad';
  const button = (label: string, cls: string, aria: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `key ${cls}`;
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  };
  const digit = (d: number) => button(String(d), 'key-digit', String(d), () => opts.onDigit(d));
  const back = button('⌫', 'key-back', 'Löschen', opts.onBackspace);
  const submit = button(opts.submitLabel ?? '✓', 'key-submit', opts.submitLabel ?? 'Fertig', opts.onSubmit);
  el.append(...[1, 2, 3, 4, 5].map(digit), back, ...[6, 7, 8, 9, 0].map(digit), submit);

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    // Typing into a text field (e.g. the name) is not meant for the pad.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (/^\d$/.test(e.key)) opts.onDigit(Number(e.key));
    else if (e.key === 'Backspace') opts.onBackspace();
    else if (e.key === 'Enter') {
      // Enter sends; it does not press the key tapped last as well (the space bar does that).
      if (e.target instanceof Node && el.contains(e.target)) e.preventDefault();
      opts.onSubmit();
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    element: el,
    setSubmitEnabled: (enabled) => (submit.disabled = !enabled),
    setSubmitLabel: (label) => {
      submit.textContent = label;
      submit.setAttribute('aria-label', label);
    },
    nudgeSubmit: () => {
      submit.classList.remove('nudge');
      // Reading the size restarts the animation on a second nudge.
      void submit.offsetWidth;
      submit.classList.add('nudge');
    },
    setDisabled: (disabled) => el.querySelectorAll('button').forEach((b) => (b.disabled = disabled)),
  };
}
