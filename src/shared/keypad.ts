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
}

export interface Keypad {
  element: HTMLElement;
  setSubmitEnabled(enabled: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function createKeypad(opts: KeypadOptions): Keypad {
  const el = document.createElement('div');
  el.className = 'keypad';
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
    else if (e.key === 'Enter') opts.onSubmit();
  };
  document.addEventListener('keydown', onKey);

  return {
    element: el,
    setSubmitEnabled: (enabled) => (submit.disabled = !enabled),
    setDisabled: (disabled) => el.querySelectorAll('button').forEach((b) => (b.disabled = disabled)),
  };
}
