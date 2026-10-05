import { confetti, plainStar, skyLayer, trophy } from '../decor';
import { escapeHtml } from '../html';
import { canSpeak, speak, stopSpeaking } from '../speech';
import { sync } from '../sync';

/**
 * The frame every exercise shares: top bar with score and tools, the round bar
 * towards the trophy, toast, star celebration and the modal dialog. The module
 * brings its own stage markup and fills it.
 */

export interface DialogAction {
  label: string;
  primary?: boolean;
  action: () => void;
}

export interface ShellOptions {
  /** Class on the root for the module's layout, e.g. "word-game". */
  className: string;
  /** Markup of the module's own area below the round bar. */
  stage: string;
  /** Label for the way back, e.g. "Zur Deutsch-Auswahl". */
  exitLabel: string;
  onExit(): void;
  onHelp(): void;
  onSpeak(): void;
  onParents(): void;
  /** A dialog opened (true) or closed (false), e.g. to pause a stopwatch. */
  onDialog?(open: boolean): void;
}

/** Some speech engines never report the end: a follow-up waits at most this long. */
const MAX_SPEECH_WAIT_MS = 30_000;

function frame(stage: string): string {
  return `
  ${skyLayer('game')}
  <header class="topbar">
    <button class="tool back" type="button" data-ref="back">‹</button>
    <div class="score" aria-live="polite">
      <span class="stars" title="Sterne"><span class="score-icon">${plainStar('#fbbf24')}</span><span data-ref="stars">0</span></span>
      <span class="trophies" title="Pokale"><span class="score-icon">${trophy()}</span><span data-ref="trophies">0</span></span>
    </div>
    <div class="tools">
      <button class="tool" type="button" data-ref="speak" aria-label="Vorlesen">🔊</button>
      <button class="tool" type="button" data-ref="help" aria-label="Hilfe">?</button>
      <button class="tool tool-quiet" type="button" data-ref="parents" aria-label="Elternbereich">⚙</button>
    </div>
  </header>
  <div class="round" data-ref="round">
    <div class="round-track"><div class="round-fill" data-ref="roundFill"></div></div>
    <span class="round-goal">${trophy()}</span>
    <span class="round-label" data-ref="roundLabel"></span>
  </div>
  ${stage}
  <div class="toast" data-ref="toast" hidden></div>
  <div class="celebrate" data-ref="celebrate" hidden aria-hidden="true">${plainStar('#fbbf24')}</div>
  <dialog class="dialog" data-ref="dialog">
    <div data-ref="dialogBody"></div>
    <div class="dialog-actions" data-ref="dialogActions"></div>
  </dialog>`;
}

export class GameShell {
  private readonly timers = new Set<number>();
  private disposed = false;
  private dialogDismiss: (() => void) | null = null;
  private afterDialog: (() => void) | null = null;
  /** Counts read-alouds, so the end of an interrupted one is not taken for the current. */
  private speech = 0;
  private speaking = false;
  private afterSpeech: (() => void) | null = null;
  private readonly ui: {
    stars: HTMLElement;
    trophies: HTMLElement;
    round: HTMLElement;
    roundFill: HTMLElement;
    roundLabel: HTMLElement;
    help: HTMLButtonElement;
    speak: HTMLButtonElement;
    toast: HTMLElement;
    celebrate: HTMLElement;
    dialog: HTMLDialogElement;
    dialogBody: HTMLElement;
    dialogActions: HTMLElement;
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ShellOptions,
  ) {
    root.innerHTML = frame(options.stage);
    root.classList.add(options.className);
    this.ui = {
      stars: this.ref('stars'),
      trophies: this.ref('trophies'),
      round: this.ref('round'),
      roundFill: this.ref('roundFill'),
      roundLabel: this.ref('roundLabel'),
      help: this.ref('help'),
      speak: this.ref('speak'),
      toast: this.ref('toast'),
      celebrate: this.ref('celebrate'),
      dialog: this.ref('dialog'),
      dialogBody: this.ref('dialogBody'),
      dialogActions: this.ref('dialogActions'),
    };

    const back = this.ref<HTMLButtonElement>('back');
    back.setAttribute('aria-label', options.exitLabel);
    back.addEventListener('click', options.onExit);
    this.ui.help.addEventListener('click', options.onHelp);
    this.ui.speak.hidden = !canSpeak();
    this.ui.speak.addEventListener('click', options.onSpeak);
    this.ref('parents').addEventListener('click', options.onParents);

    // Escape / Android back: keep the dialog. Should the browser close it anyway,
    // run its dismiss action so the game never stays stuck.
    this.ui.dialog.addEventListener('cancel', (e) => e.preventDefault());
    this.ui.dialog.addEventListener('close', () => {
      if (!this.ui.dialog.open) options.onDialog?.(false);
      if (this.disposed || this.ui.dialog.open || !this.dialogDismiss) return;
      const dismiss = this.dialogDismiss;
      this.dialogDismiss = null;
      dismiss();
      this.flushAfterDialog();
    });
  }

  /** An element of the frame or the stage by its data-ref. */
  ref<T extends HTMLElement = HTMLElement>(name: string): T {
    const node = this.root.querySelector<T>(`[data-ref="${name}"]`);
    if (!node) throw new Error(`ref ${name} missing`);
    return node;
  }

  setScore(stars: number, trophies: number): void {
    this.ui.stars.textContent = String(stars);
    this.ui.trophies.textContent = String(trophies);
  }

  /** Round bar: `done` of `target`, e.g. "4 / 10 Aufgaben". */
  setRound(done: number, target: number, unit: string, ariaLabel: string): void {
    this.ui.roundFill.style.width = `${Math.min(100, (done / target) * 100)}%`;
    this.ui.roundLabel.textContent = `${Math.min(done, target)} / ${target} ${unit}`;
    this.ui.round.setAttribute('aria-label', ariaLabel);
  }

  setHelpEnabled(enabled: boolean): void {
    this.ui.help.disabled = !enabled;
  }

  /** A timeout that is cleared on reset and dispose. */
  later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  /** Clears all pending timeouts and a follow-up waiting for the dialog or speech. */
  cancelPending(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    this.afterDialog = null;
    this.afterSpeech = null;
  }

  /**
   * Reads the parts aloud; `onPart` reports the index being spoken, -1 when
   * done. A follow-up passed to whenIdle() waits until the end.
   */
  speak(parts: string[], onPart: (index: number) => void = () => {}): void {
    const id = ++this.speech;
    this.speaking = true;
    speak(parts, (i) => {
      onPart(i);
      if (i === -1 && id === this.speech) this.speechEnded();
    });
  }

  stopSpeaking(): void {
    this.speech += 1;
    stopSpeaking();
    this.speechEnded();
  }

  private speechEnded(): void {
    this.speaking = false;
    const next = this.afterSpeech;
    this.afterSpeech = null;
    next?.();
  }

  /**
   * Runs `fn` once nothing is read aloud and no dialog is open: moving on to
   * the next task never cuts off an explanation she asked to hear.
   */
  whenIdle(fn: () => void): void {
    if (!this.speaking) {
      this.whenNoDialog(fn);
      return;
    }
    const waiting = () => this.whenNoDialog(fn);
    this.afterSpeech = waiting;
    this.later(() => {
      if (this.afterSpeech === waiting) this.speechEnded();
    }, MAX_SPEECH_WAIT_MS);
  }

  toast(text: string): void {
    this.ui.toast.textContent = text;
    restartAnimation(this.ui.toast, 'show');
    this.later(() => (this.ui.toast.hidden = true), 3200);
  }

  celebrate(): void {
    restartAnimation(this.ui.celebrate, 'pop');
    this.later(() => (this.ui.celebrate.hidden = true), 1800);
  }

  /** "+15" floating up from the round bar. */
  floatPoints(points: number): void {
    const f = document.createElement('span');
    f.className = 'float-points';
    f.textContent = `+${points}`;
    this.ui.round.appendChild(f);
    this.later(() => f.remove(), 1200);
  }

  get dialogOpen(): boolean {
    return this.ui.dialog.open;
  }

  /**
   * `onDismiss` runs when the dialog closes without a button (Escape, Android
   * back), so the game never stays stuck behind a closed dialog.
   */
  showDialog(html: string, actions: DialogAction[], onDismiss: () => void = () => {}): void {
    this.dialogDismiss = onDismiss;
    this.ui.dialogBody.innerHTML = html;
    this.ui.dialogActions.replaceChildren(
      ...actions.map((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = a.primary ? 'btn primary' : 'btn';
        b.textContent = a.label;
        b.addEventListener('click', () => this.closeDialog(a.action));
        return b;
      }),
    );
    if (!this.ui.dialog.open) this.ui.dialog.showModal();
    this.options.onDialog?.(true);
  }

  /**
   * Closes the dialog and runs the follow-up synchronously. The asynchronous
   * 'close' event must not act again: by then another dialog may be open.
   */
  closeDialog(then: () => void): void {
    this.dialogDismiss = null;
    this.ui.dialog.close();
    this.options.onDialog?.(false);
    then();
    this.flushAfterDialog();
  }

  /** Runs `fn` now, or once an open dialog (e.g. the parents' area) has been closed. */
  whenNoDialog(fn: () => void): void {
    if (this.ui.dialog.open) this.afterDialog = fn;
    else fn();
  }

  private flushAfterDialog(): void {
    if (this.ui.dialog.open || !this.afterDialog) return;
    const deferred = this.afterDialog;
    this.afterDialog = null;
    deferred();
  }

  /** Trophy dialog at the end of a round, with the name of the signed-in profile. */
  showTrophy(lines: string[], actions: DialogAction[], onDismiss: () => void): void {
    const name = sync.account()?.name;
    this.showDialog(
      `<div class="trophy">${trophy()}</div><h2>${name ? `${escapeHtml(name)}, ` : ''}Durchgang geschafft!</h2>${lines.join('')}`,
      actions,
      onDismiss,
    );
    // Inside the modal dialog, so the sweets fall above its backdrop.
    confetti(this.ui.dialog);
  }

  /** Runs `onConfirm` only after the button was held down for `ms`. */
  holdToConfirm(button: HTMLButtonElement, ms: number, onConfirm: () => void): void {
    let timer: number | undefined;
    const cancel = () => {
      window.clearTimeout(timer);
      button.classList.remove('holding');
    };
    button.addEventListener('pointerdown', () => {
      button.classList.add('holding');
      timer = window.setTimeout(() => {
        cancel();
        onConfirm();
      }, ms);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, cancel);
  }

  dispose(): void {
    this.disposed = true;
    this.afterSpeech = null;
    stopSpeaking();
    for (const id of this.timers) window.clearTimeout(id);
    if (this.ui.dialog.open) this.ui.dialog.close();
    this.root.classList.remove(this.options.className);
    this.root.replaceChildren();
  }
}

function restartAnimation(node: HTMLElement, cls: string): void {
  node.hidden = false;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}
