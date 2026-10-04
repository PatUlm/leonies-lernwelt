import { CHILD_NAME } from '../../config';
import { confetti, plainStar, skyLayer, trophy } from '../../shared/decor';
import { canSpeak, speak, stopSpeaking } from '../../shared/speech';
import type { ModuleContext, ModuleStats } from '../types';
import { AnalogClock } from './clock';
import {
  CORRECT_PER_STAR, Engine, label,
  type AnswerResult, type RoundSummary, type Task, type Track,
} from './engine';
import { capitalize, formatSpokenCapitalized, numberWord } from './german';
import { clearProgress, loadProgress, saveProgress } from './storage';
import { BADGE_NAMES, TIER_NAMES, statsFromProgress } from './stats';
import { TIERS, type Tier } from './time';

const CORRECT_DELAY_MS = 1300;
const STAR_DELAY_MS = 900;

const MARKUP = `
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
  <main class="stage">
    <div class="clock-wrap" data-ref="clock"></div>
    <p class="message" data-ref="message" aria-live="polite"></p>
    <div class="answers" data-ref="answers"></div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>
  <div class="toast" data-ref="toast" hidden></div>
  <div class="celebrate" data-ref="celebrate" hidden aria-hidden="true">${plainStar('#fbbf24')}</div>
  <dialog class="dialog" data-ref="dialog">
    <div data-ref="dialogBody"></div>
    <div class="dialog-actions" data-ref="dialogActions"></div>
  </dialog>`;

interface DialogAction {
  label: string;
  primary?: boolean;
  action: () => void;
}

interface RoundStats {
  starsAtStart: number;
  secured: string[];
}

function practicedName(track: Track, tier: Tier): string {
  return track === 'text' ? `${TIER_NAMES[tier]} in Worten` : TIER_NAMES[tier];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clockStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

export function mountClockGame(root: HTMLElement, ctx: ModuleContext): () => void {
  root.innerHTML = MARKUP;
  root.classList.add('clock-game');
  const ref = <T extends HTMLElement = HTMLElement>(name: string): T => {
    const node = root.querySelector<T>(`[data-ref="${name}"]`);
    if (!node) throw new Error(`ref ${name} missing`);
    return node;
  };
  const ui = {
    back: ref<HTMLButtonElement>('back'),
    stars: ref('stars'),
    trophies: ref('trophies'),
    round: ref('round'),
    roundFill: ref('roundFill'),
    roundLabel: ref('roundLabel'),
    clock: ref('clock'),
    message: ref('message'),
    answers: ref('answers'),
    next: ref<HTMLButtonElement>('next'),
    help: ref<HTMLButtonElement>('help'),
    speak: ref<HTMLButtonElement>('speak'),
    parents: ref<HTMLButtonElement>('parents'),
    toast: ref('toast'),
    celebrate: ref('celebrate'),
    dialog: ref<HTMLDialogElement>('dialog'),
    dialogBody: ref('dialogBody'),
    dialogActions: ref('dialogActions'),
  };

  const { sound } = ctx;
  let engine = new Engine(loadProgress(Date.now()));
  const clock = new AnalogClock();
  ui.clock.appendChild(clock.svg);

  let task: Task;
  let phase: 'question' | 'feedback' = 'question';
  let helpUsed = false;
  let buttons: HTMLButtonElement[] = [];
  let pendingToast: string | null = null;
  let afterFeedback: (() => void) | null = null;
  let round = newRoundStats();
  const timers = new Set<number>();
  let disposed = false;
  let dialogDismiss: (() => void) | null = null;
  let afterDialog: (() => void) | null = null;

  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function newRoundStats(): RoundStats {
    return { starsAtStart: engine.stars, secured: [] };
  }

  /** `shown` lets the bar stay full on a just completed round until the next task. */
  function renderScore(shown: { points: number; target: number } = engine.progress.round): void {
    ui.stars.textContent = String(engine.stars);
    ui.trophies.textContent = String(engine.progress.trophies);
    const { points, target } = shown;
    ui.roundFill.style.width = `${Math.min(100, (points / target) * 100)}%`;
    ui.roundLabel.textContent = `${Math.min(points, target)} / ${target} Punkte`;
    ui.round.setAttribute('aria-label', `${points} von ${target} Punkten bis zum Pokal`);
  }

  function answerLabel(t: Task['time']): string {
    return task.track === 'text' ? formatSpokenCapitalized(t) : label(task.track, t);
  }

  // --- task flow -------------------------------------------------------------

  function nextTask(): void {
    stopSpeaking();
    engine.touch(Date.now());
    task = engine.nextTask();
    saveProgress(engine.progress);
    renderScore();
    phase = 'question';
    helpUsed = false;
    afterFeedback = null;

    clock.setTime(task.time);
    const example = task.kind === 'example';
    clock.setHelpers({ minuteLabels: task.minuteLabels, quarters: example && (task.tier === 2 || task.tier === 3) });
    clock.setFocus(example ? (task.time.minute === 0 ? 'hour' : 'minute') : null, task.time);

    ui.answers.classList.toggle('text-answers', task.track === 'text');
    buttons = task.options.map((option, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'answer';
      b.textContent = answerLabel(option.time);
      b.addEventListener('click', () => onAnswer(i));
      return b;
    });
    ui.answers.replaceChildren(...buttons);

    if (example) {
      buttons[task.correctIndex].classList.add('suggested');
      setMessage(`Schau mal: ${task.explanation}`, 'explain');
    } else {
      const question = task.track === 'text' ? 'Wie sagt man?' : 'Wie spät ist es?';
      setMessage(task.familiar ? `Das kannst du schon! ${question}` : question, 'question');
    }
    ui.next.hidden = true;
    ui.help.disabled = example;

    if (pendingToast) {
      showToast(pendingToast);
      pendingToast = null;
    }
  }

  function onAnswer(index: number): void {
    if (phase !== 'question') return;

    if (task.kind === 'example') {
      if (index !== task.correctIndex) {
        setMessage('Schau noch mal: Der leuchtende Knopf ist richtig.', 'explain');
        return;
      }
      phase = 'feedback';
      lockAnswers();
      engine.answer(task, index, false);
      saveProgress(engine.progress);
      buttons[index].classList.add('correct');
      setMessage(`Genau! Es ist ${label(task.track, task.time)}.`, 'good');
      sound.correct();
      later(() => whenNoDialog(nextTask), CORRECT_DELAY_MS);
      return;
    }

    phase = 'feedback';
    lockAnswers();
    const result = engine.answer(task, index, helpUsed);
    saveProgress(engine.progress);
    renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) {
      pendingToast = `Neu: ${result.unlocked.map((u) => practicedName(u.track, u.tier)).join(', ')}!`;
    }
    round.secured.push(...result.secured.map((s) => BADGE_NAMES[s.track][s.tier]));

    buttons[result.correctIndex].classList.add('correct');
    const it = label(task.track, task.time);
    if (result.ok) {
      setMessage(helpUsed ? `Gemeinsam geschafft! Es ist ${it}.` : `Richtig! Es ist ${it}.`, 'good');
      if (result.streak) {
        const n = result.streak <= 12 ? capitalize(numberWord(result.streak)) : String(result.streak);
        showToast(`${n} hintereinander geschafft!`);
      }
      sound.correct();
      if (result.points) floatPoints(ui.round, result.points);
      let delay = CORRECT_DELAY_MS;
      if (result.starEarned) {
        celebrate();
        sound.star();
        delay += STAR_DELAY_MS;
      }
      later(() => whenNoDialog(() => afterAnswer(result)), delay);
    } else {
      buttons[index].classList.add('chosen');
      setMessage(`Schauen wir zusammen. ${result.hint ?? ''}`, 'explain');
      clock.setFocus(result.hintFocus ?? null, task.time);
      if (result.hintFocus === 'minute') clock.setHelpers({ minuteLabels: true, quarters: false });
      afterFeedback = () => afterAnswer(result);
      ui.next.hidden = false;
    }
  }

  function afterAnswer(result: AnswerResult): void {
    if (result.roundComplete) {
      showTrophy(result.roundComplete);
      return;
    }
    if (result.offerPause) {
      showDialog(
        '<h2>Kleine Pause?</h2><p>Das war gerade knifflig. Wir können gleich weitermachen oder eine Pause machen. Dein Durchgang bleibt gespeichert.</p>',
        [
          { label: 'Pause machen', action: ctx.exit },
          { label: 'Weiter üben', primary: true, action: nextTask },
        ],
        nextTask,
      );
      return;
    }
    nextTask();
  }

  function showTrophy(summary: RoundSummary): void {
    stopSpeaking();
    sound.star();
    const stars = engine.stars - round.starsAtStart;
    const lines = [`<p class="round-score">${summary.points} Punkte · ${plural(summary.tasks, 'Uhrzeit', 'Uhrzeiten')} geübt</p>`];
    if (stars > 0) {
      const icons = `<span class="inline-stars">${plainStar('#fbbf24').repeat(Math.min(stars, 5))}</span>`;
      lines.push(`<p>Neu: ${icons} ${plural(stars, 'Stern', 'Sterne')}</p>`);
    }
    for (const badge of round.secured) lines.push(`<p class="badge">${badge}</p>`);
    round = newRoundStats();
    showDialog(
      `<div class="trophy">${trophy()}</div><h2>${CHILD_NAME}, Durchgang geschafft!</h2>${lines.join('')}`,
      [
        { label: ctx.exitLabel, action: ctx.exit },
        { label: 'Noch ein Durchgang', action: nextTask },
      ],
      nextTask,
    );
    // Inside the modal dialog, so the sweets fall above its backdrop.
    confetti(ui.dialog);
  }

  // --- UI helpers --------------------------------------------------------------

  function setMessage(text: string, tone: 'question' | 'good' | 'explain'): void {
    ui.message.textContent = text;
    ui.message.className = `message ${tone}`;
  }

  function lockAnswers(): void {
    for (const b of buttons) b.disabled = true;
    stopSpeaking();
  }

  function restartAnimation(node: HTMLElement, cls: string): void {
    node.hidden = false;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function showToast(text: string): void {
    ui.toast.textContent = text;
    restartAnimation(ui.toast, 'show');
    later(() => (ui.toast.hidden = true), 3200);
  }

  function celebrate(): void {
    restartAnimation(ui.celebrate, 'pop');
    later(() => (ui.celebrate.hidden = true), 1800);
  }

  function floatPoints(anchor: HTMLElement, points: number): void {
    const f = document.createElement('span');
    f.className = 'float-points';
    f.textContent = `+${points}`;
    anchor.appendChild(f);
    later(() => f.remove(), 1200);
  }

  /**
   * `onDismiss` runs when the dialog closes without a button (Escape, Android
   * back), so the game never stays stuck behind a closed dialog.
   */
  function showDialog(html: string, actions: DialogAction[], onDismiss: () => void = () => {}): void {
    dialogDismiss = onDismiss;
    ui.dialogBody.innerHTML = html;
    ui.dialogActions.replaceChildren(
      ...actions.map((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = a.primary ? 'btn primary' : 'btn';
        b.textContent = a.label;
        b.addEventListener('click', () => closeDialog(a.action));
        return b;
      }),
    );
    if (!ui.dialog.open) ui.dialog.showModal();
  }

  /**
   * Closes the dialog and runs the follow-up synchronously. The asynchronous
   * 'close' event must not act again: by then another dialog may be open.
   */
  function closeDialog(then: () => void): void {
    dialogDismiss = null;
    ui.dialog.close();
    then();
    flushAfterDialog();
  }

  /** Runs `fn` now, or once an open dialog (e.g. the parents' area) has been closed. */
  function whenNoDialog(fn: () => void): void {
    if (ui.dialog.open) afterDialog = fn;
    else fn();
  }

  function flushAfterDialog(): void {
    if (ui.dialog.open || !afterDialog) return;
    const deferred = afterDialog;
    afterDialog = null;
    deferred();
  }

  // Escape / Android back: keep the dialog. Should the browser close it anyway,
  // run its dismiss action so the game never stays stuck.
  ui.dialog.addEventListener('cancel', (e) => e.preventDefault());
  ui.dialog.addEventListener('close', () => {
    if (disposed || ui.dialog.open || !dialogDismiss) return;
    const dismiss = dialogDismiss;
    dialogDismiss = null;
    dismiss();
    flushAfterDialog();
  });

  // --- tools -------------------------------------------------------------------

  ui.back.setAttribute('aria-label', ctx.exitLabel);
  ui.back.addEventListener('click', ctx.exit);

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  ui.help.addEventListener('click', () => {
    if (phase !== 'question' || task.kind === 'example') return;
    helpUsed = true;
    clock.setHelpers({ minuteLabels: true, quarters: true });
    clock.setFocus('hour', task.time);
    const rule = task.track === 'text' ? ' Bei „halb“ und bei „vor“ sagt man schon die nächste Stunde.' : '';
    setMessage(
      `Der kurze blaue Zeiger zeigt die Stunde. Der lange orange Zeiger zeigt die Minuten – die kleinen Zahlen außen helfen beim Zählen.${rule}`,
      'explain',
    );
  });

  ui.speak.hidden = !canSpeak();
  ui.speak.addEventListener('click', () => {
    if (phase === 'question' && task.kind !== 'example') {
      const parts = [ui.message.textContent ?? '', ...buttons.map((b) => b.textContent ?? '')];
      speak(parts, (i) => buttons.forEach((b, j) => b.classList.toggle('speaking', j === i - 1)));
    } else {
      speak([ui.message.textContent ?? '']);
    }
  });

  ui.parents.addEventListener('click', showParents);

  function showParents(): void {
    const rows = (['digital', 'text'] as const)
      .map((track) => {
        const cells = TIERS.map((tier) => {
          const s = engine.tierState(track, tier);
          const rate = s.window.length ? `${s.window.filter((a) => a.ok).length}/${s.window.length}` : '–';
          const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${rate}` : '–';
          return `<td class="${s.unlocked ? '' : 'locked'}">${status}</td>`;
        }).join('');
        return `<tr><th>${track === 'digital' ? 'Zahl' : 'Text'}</th>${cells}</tr>`;
      })
      .join('');
    const header = TIERS.map((t) => `<th title="${TIER_NAMES[t]}">S${t}</th>`).join('');
    showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>
       <p class="legend">S1 volle · S2 halbe · S3 Viertel · S4 10er · S5 5er · S6 einzelne Minuten.<br>
       „übt 6/8“ = richtige der letzten 8 Antworten · „gelernt“ = nächste Stufe frei ·
       „sicher“ = in einer späteren Sitzung bestätigt. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten.</p>
       <label class="setting"><input type="checkbox" data-ref="soundToggle" ${ctx.settings.sound ? 'checked' : ''}/> Töne</label>
       <p><button type="button" class="btn danger" data-ref="reset">Fortschritt löschen (3 Sek. halten)</button></p>`,
      [{ label: 'Schließen', primary: true, action: () => {} }],
    );
    ref<HTMLInputElement>('soundToggle').addEventListener('change', (e) => {
      ctx.settings.sound = (e.target as HTMLInputElement).checked;
      sound.enabled = ctx.settings.sound;
      ctx.saveSettings();
    });
    holdToConfirm(ref<HTMLButtonElement>('reset'), 3000, () => {
      clearProgress();
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      afterDialog = null;
      engine = new Engine(loadProgress(Date.now()));
      round = newRoundStats();
      closeDialog(nextTask);
    });
  }

  function holdToConfirm(button: HTMLButtonElement, ms: number, onConfirm: () => void): void {
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

  renderScore();
  nextTask();

  return () => {
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    stopSpeaking();
    if (ui.dialog.open) ui.dialog.close();
    root.classList.remove('clock-game');
    root.replaceChildren();
  };
}
