import { plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { MARKED_IS_RIGHT } from '../../shared/game/texts';
import { escapeHtml } from '../../shared/html';
import { createKeypad } from '../../shared/keypad';
import type { ModuleContext, ModuleStats } from '../types';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, MIN_DISTINCT, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS, SECURE_MASTERY,
  SECURE_WINDOW_CORRECT, SESSION_GAP_MS, STAGES, WINDOW, answerOf, diagnose, stepsOf,
  type AnswerResult, type Diagnosis, type RoundState, type Step, type Task,
} from './engine';
import { badgeName, stageName, statsFromProgress } from './stats';
import { clearProgress, loadProgress, saveProgress } from './storage';
import {
  CHOOSE_HELP, CHOOSE_QUESTION, CHOOSE_RIGHT, CHOOSE_WRONG, EXAMPLE_TYPE, HINTS, chooseExample, confirmation, exampleText,
  help, inverseOptions, inverseText, question, reveal, termsText,
} from './texts';

const CORRECT_DELAY_MS = 1800;
const STAR_DELAY_MS = 900;
/** Results stay below 101: three digits are enough. */
const MAX_DIGITS = 3;

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="calc-card" data-ref="card"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="message-text" data-ref="message"></span>
    </p>
    <div class="answers mode-input calc-answers" data-ref="answers">
      <div class="calc-choices" data-ref="choices" hidden></div>
    </div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function inverseStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

/**
 * choose: pick the inverse; input: type the open line; wait: a shown result or
 * a wrong choice waits for "Weiter"; done: the gap is filled.
 */
type Phase = 'choose' | 'input' | 'wait' | 'done';

export function mountInverseGame(root: HTMLElement, ctx: ModuleContext): () => void {
  const shell = new GameShell(root, {
    className: 'calc-game',
    stage: STAGE_MARKUP,
    exitLabel: ctx.exitLabel,
    onExit: ctx.exit,
    onHelp: showHelp,
    onSpeak: readAloud,
    onParents: showParents,
  });
  const ui = {
    card: shell.ref('card'),
    messageBox: shell.ref('messageBox'),
    message: shell.ref('message'),
    answers: shell.ref('answers'),
    choices: shell.ref('choices'),
    next: shell.ref<HTMLButtonElement>('next'),
  };
  // One pad for the whole game: its key listener ends once it leaves the page.
  const keypad = createKeypad({ onDigit: typeDigit, onBackspace: backspace, onSubmit: submit });
  ui.answers.append(keypad.element);

  const { sound } = ctx;
  let engine = new Engine(loadProgress(Date.now()));
  let task: Task;
  let steps: Step[] = [];
  let stepIndex = 0;
  let phase: Phase = 'input';
  let typed = '';
  /** Wrong tries on the open line. */
  let tries = 0;
  /** The typed number is shown as wrong until the next key. */
  let wrongShown = false;
  /** Lines whose result had to be shown. */
  let shownLines = new Set<number>();
  let lastDiagnosis: Diagnosis | null = null;
  let helpUsed = false;
  let mistake = false;
  /** A mistake before any help: the task stays her own try. */
  let mistakeAlone = false;
  let expanded = false;
  /** An example's number (or choice) lights up once the explanation of its line has been read. */
  let ghost = false;
  let locked = false;
  /** The ones line just took over the tens result: it pops in once. */
  let copied = false;
  let pendingToast: string | null = null;
  let afterFeedback: (() => void) | null = null;
  let round = newRoundStats();

  function newRoundStats(): { starsAtStart: number; secured: string[] } {
    return { starsAtStart: engine.stars, secured: [] };
  }

  /** `shown` lets the bar stay full on a just completed round until the next task. */
  function renderScore(shown: RoundState = engine.progress.round): void {
    shell.setScore(engine.stars, engine.progress.trophies);
    shell.setRound(shown.tasks, ROUND_TASKS, 'Aufgaben', `${shown.tasks} von ${ROUND_TASKS} Aufgaben bis zum Pokal`);
  }

  // --- task flow -------------------------------------------------------------

  function nextTask(): void {
    shell.stopSpeaking();
    engine.touch(Date.now());
    task = engine.nextTask();
    saveProgress(engine.progress);
    renderScore();
    steps = stepsOf(task);
    stepIndex = 0;
    typed = '';
    tries = 0;
    wrongShown = false;
    shownLines = new Set();
    lastDiagnosis = null;
    helpUsed = false;
    mistake = false;
    mistakeAlone = false;
    expanded = false;
    ghost = false;
    copied = false;
    afterFeedback = null;
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(task.kind !== 'example');

    locked = false;
    if (task.choose) {
      phase = 'choose';
      showChoices();
      if (task.kind === 'example') {
        explainExample(chooseExample(task.problem), () => {
          ui.choices.querySelector('[data-right="true"]')?.classList.add('suggested');
        });
      } else {
        setMessage(CHOOSE_QUESTION, 'question');
      }
    } else {
      startInput();
    }
    renderCard();

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  function startInput(): void {
    phase = 'input';
    ui.choices.hidden = true;
    keypad.element.hidden = false;
    keypad.setDisabled(false);
    updateSubmit();
    if (task.kind !== 'example') {
      setMessage(question(steps[stepIndex]), 'question');
      return;
    }
    ghost = false;
    explainExample(exampleText(task.stage, task.problem, steps[stepIndex]), () => {
      ghost = true;
      renderCard();
    });
  }

  /** An example's message is read aloud at once; what to tap or type lights up afterwards. */
  function explainExample(text: string, reveal: () => void): void {
    const shown = task;
    const at = stepIndex;
    const current = () => task === shown && stepIndex === at;
    locked = true;
    setMessage(text, 'explain');
    shell.explain([text], {
      unlock: () => current() && (locked = false),
      reveal: () => current() && reveal(),
    });
  }

  function showChoices(): void {
    keypad.element.hidden = true;
    // The right one left or right at random: its place gives nothing away.
    const options = inverseOptions(task.problem);
    const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
    ui.choices.replaceChildren(
      ...order.map((i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'answer calc-choice';
        b.textContent = options[i];
        b.dataset.right = String(i === 0);
        b.addEventListener('click', () => onChoice(b));
        return b;
      }),
    );
    ui.choices.hidden = false;
  }

  function onChoice(button: HTMLButtonElement): void {
    if (phase !== 'choose' || locked || !shell.answersReady) return;
    const buttons = [...ui.choices.querySelectorAll<HTMLButtonElement>('button')];
    const right = button.dataset.right === 'true';
    if (task.kind === 'example' && !right) {
      // Before the mark the explanation goes on; it is no mistake.
      if (buttons.some((b) => b.classList.contains('suggested'))) {
        setMessage(MARKED_IS_RIGHT, 'explain');
        shell.speak([MARKED_IS_RIGHT]);
      }
      return;
    }
    for (const b of buttons) b.disabled = true;
    buttons.find((b) => b.dataset.right === 'true')!.classList.add('correct');
    if (right) {
      startInput();
      if (task.kind !== 'example') setMessage(`${CHOOSE_RIGHT} ${question(steps[stepIndex])}`, 'question');
      renderCard();
      return;
    }
    button.classList.add('wrong');
    noteMistake();
    phase = 'wait';
    setMessage(CHOOSE_WRONG, 'explain');
    renderCard();
    showNext(() => {
      startInput();
      renderCard();
    });
  }

  function noteMistake(): void {
    mistake = true;
    if (!helpUsed) mistakeAlone = true;
  }

  /** The pad also listens to the keyboard: keys typed into a dialog (parents' area) are not answers. */
  function canType(): boolean {
    return phase === 'input' && !locked && !shell.dialogOpen;
  }

  function typeDigit(d: number): void {
    if (!canType() || !shell.answersReady) return;
    if (wrongShown) {
      typed = '';
      wrongShown = false;
      lastDiagnosis = null;
    }
    if (typed.length >= MAX_DIGITS || (typed === '' && d === 0)) return;
    typed += String(d);
    updateSubmit();
    renderCard();
  }

  function backspace(): void {
    if (!canType()) return;
    if (wrongShown) {
      typed = '';
      wrongShown = false;
      lastDiagnosis = null;
    }
    typed = typed.slice(0, -1);
    updateSubmit();
    renderCard();
  }

  function updateSubmit(): void {
    keypad.setSubmitEnabled(typed !== '' && !wrongShown);
  }

  function submit(): void {
    if (!canType() || typed === '' || wrongShown || !shell.answersReady) return;
    const step = steps[stepIndex];
    const given = Number(typed);
    if (given === step.result) {
      advance();
      return;
    }
    if (task.kind === 'example') {
      // Not a mistake: the number to copy lights up.
      typed = '';
      ghost = true;
      updateSubmit();
      renderCard();
      setMessage(EXAMPLE_TYPE, 'explain');
      shell.speak([EXAMPLE_TYPE]);
      return;
    }
    tries += 1;
    // The check sum is a habit, not part of the inverse: it never counts as a mistake.
    if (step.kind !== 'probe') noteMistake();
    if (tries === 1) {
      lastDiagnosis = diagnose(step, given);
      wrongShown = true;
      updateSubmit();
      renderCard();
      setMessage(HINTS[lastDiagnosis], 'explain');
      shell.speak([HINTS[lastDiagnosis]]);
      return;
    }
    // Second wrong try: the line is shown, she moves on with the right number.
    shownLines.add(stepIndex);
    typed = '';
    wrongShown = false;
    lastDiagnosis = null;
    phase = 'wait';
    keypad.setDisabled(true);
    renderCard();
    setMessage(reveal(step), 'explain');
    showNext(() => advance());
  }

  /** The open line is done: on to the next, or the gap is filled. */
  function advance(): void {
    copied = steps[stepIndex].kind === 'tens';
    stepIndex += 1;
    typed = '';
    tries = 0;
    wrongShown = false;
    lastDiagnosis = null;
    if (stepIndex < steps.length) {
      startInput();
      renderCard();
      return;
    }
    complete();
  }

  function complete(): void {
    phase = 'done';
    keypad.setDisabled(true);
    renderCard();
    const result = engine.answer(task, {
      mistake,
      helped: helpUsed,
      helpFirst: helpUsed && !mistakeAlone,
      shown: [...shownLines].some((i) => steps[i].kind !== 'probe'),
    });
    finish(result);
  }

  function finish(result: AnswerResult): void {
    saveProgress(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) pendingToast = `Neu: ${result.unlocked.map(stageName).join(', ')}`;
    round.secured.push(...result.secured.map(badgeName));

    const lead = task.kind === 'example' ? 'Genau!' : result.ok ? 'Richtig!' : 'Gemeinsam geschafft!';
    setMessage(`${lead} ${confirmation(task.problem)}`, 'good');
    if (result.streak) shell.toast(`${result.streak} hintereinander geschafft!`);
    sound.correct();
    if (result.points) shell.floatPoints(result.points);
    let delay = CORRECT_DELAY_MS;
    if (result.starEarned) {
      shell.celebrate();
      sound.star();
      delay += STAR_DELAY_MS;
    }
    shell.later(() => shell.whenIdle(() => afterAnswer(result)), delay);
  }

  /** "Weiter" after a shown result or a wrong choice, active after a moment: time to look. */
  function showNext(then: () => void): void {
    afterFeedback = then;
    ui.next.hidden = false;
    ui.next.disabled = true;
    shell.afterLock(() => afterFeedback === then && (ui.next.disabled = false));
  }

  function afterAnswer(result: AnswerResult): void {
    if (result.roundComplete) {
      showTrophy(result.roundComplete);
      return;
    }
    if (result.offerPause) {
      shell.showDialog(
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

  function showTrophy(summary: RoundState): void {
    shell.stopSpeaking();
    sound.star();
    const stars = engine.stars - round.starsAtStart;
    const lines = [`<p class="round-score">${summary.points} Punkte · ${plural(summary.correct, 'Aufgabe', 'Aufgaben')} allein richtig</p>`];
    if (stars > 0) {
      const icons = `<span class="inline-stars">${plainStar('#fbbf24').repeat(Math.min(stars, 5))}</span>`;
      lines.push(`<p>Neu: ${icons} ${plural(stars, 'Stern', 'Sterne')}</p>`);
    }
    for (const badge of round.secured) lines.push(`<p class="badge">${escapeHtml(badge)}</p>`);
    round = newRoundStats();
    shell.showTrophy(
      lines,
      [
        { label: ctx.exitLabel, action: ctx.exit },
        { label: 'Noch ein Durchgang', action: nextTask },
      ],
      nextTask,
    );
  }

  function setMessage(text: string, tone: 'question' | 'good' | 'explain'): void {
    ui.message.textContent = text;
    ui.messageBox.className = `message ${tone}`;
  }

  // --- card ------------------------------------------------------------------

  function renderCard(): void {
    const p = task.problem;
    const done = phase === 'done';
    // The inverse stays open while its choices are on screen (also after a wrong choice).
    const choosing = !ui.choices.hidden;
    const gap = `<span class="calc-gap${done ? ' filled' : ''}">${done ? answerOf(p) : ''}</span>`;
    const gapTask = p.shape === 'front' ? `${gap} ${op('+')} ${p.part} ${op('=')} ${p.total}` : `${p.part} ${op('+')} ${gap} ${op('=')} ${p.total}`;
    const rows = [row('Aufgabe', gapTask, 'calc-task')];
    const direct = steps.findIndex((s) => s.kind === 'direct');
    if (choosing) rows.push(row('Umkehraufgabe', '<span class="calc-field pending">?</span>', 'calc-inverse'));
    else if (direct >= 0) rows.push(row('Umkehraufgabe', line(direct), 'calc-inverse'));
    else rows.push(row('Umkehraufgabe', escapeHtml(inverseText(p)).replace('−', op('−')), 'calc-inverse'));
    if (!choosing) {
      steps.forEach((s, i) => {
        if (s.kind === 'direct') return;
        if (s.kind === 'probe') {
          if (i <= stepIndex) rows.push(row('Probe', line(i), 'calc-probe'));
          return;
        }
        rows.push(row('', line(i), 'calc-step'));
      });
    }
    ui.card.innerHTML = `<div class="calc-rows">${rows.join('')}</div>`;
    ui.card.classList.toggle('calc-done', done);
    copied = false;
  }

  function row(label: string, eq: string, cls: string): string {
    const head = label ? `<span class="calc-label">${label}</span>` : '';
    return `<div class="calc-row ${cls}">${head}<span class="calc-eq">${eq}</span></div>`;
  }

  /** An operator; after "added" the minus is marked: subtracting makes it smaller. */
  function op(sign: string, flag = false): string {
    return `<span class="calc-op${flag ? ' flag' : ''}">${sign}</span>`;
  }

  /** "90 − 20 = [field]"; the ones line starts with the tens result, taken over once it is known. */
  function line(i: number): string {
    const s = steps[i];
    const flag = i === stepIndex && lastDiagnosis === 'added';
    const terms = s.terms.map((t, j) => {
      if (j === 0 && s.kind === 'ones') {
        if (i > stepIndex && !shownLines.has(i - 1)) return '<span class="calc-field pending small"></span>';
        return `<span class="calc-copy${copied && i === stepIndex ? ' copied' : ''}">${t}</span>`;
      }
      return String(t);
    });
    return `${terms.join(` ${op(s.op, flag)} `)} ${op('=')} ${field(i)}`;
  }

  function field(i: number): string {
    const s = steps[i];
    if (i < stepIndex || phase === 'done' || shownLines.has(i)) {
      return `<span class="calc-field ${shownLines.has(i) ? 'shown' : 'ok'}">${s.result}</span>`;
    }
    if (i > stepIndex || phase !== 'input') return '<span class="calc-field pending"></span>';
    const content = typed || (task.kind === 'example' && ghost ? `<span class="ghost">${s.result}</span>` : '');
    return `<span class="calc-field active${wrongShown ? ' wrong' : ''}" aria-label="Hier rechnen">${content}</span>`;
  }

  // --- tools -------------------------------------------------------------------

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  function showHelp(): void {
    if ((phase !== 'input' && phase !== 'choose') || task.kind === 'example') return;
    helpUsed = true;
    if (phase === 'choose') {
      setMessage(CHOOSE_HELP, 'explain');
      shell.speak([CHOOSE_HELP]);
      return;
    }
    const step = steps[stepIndex];
    if ((step.kind === 'line' || step.kind === 'direct') && !expanded) {
      // Back to the two lines: the strategy made visible again.
      expanded = true;
      steps = stepsOf(task, true);
      stepIndex = 0;
      typed = '';
      tries = 0;
      wrongShown = false;
      lastDiagnosis = null;
      updateSubmit();
      renderCard();
    }
    const text = help(step);
    setMessage(text, 'explain');
    shell.speak([text]);
  }

  /** The message, then the open line with its numbers ("90 minus 20 gleich wie viel?"). */
  function readAloud(): void {
    const message = ui.message.textContent ?? '';
    if (phase === 'choose') {
      const options = [...ui.choices.querySelectorAll('button')];
      shell.speak([message, ...options.map((b) => b.textContent ?? '')], (i) =>
        options.forEach((b, j) => b.classList.toggle('speaking', j === i - 1)));
      return;
    }
    if (phase !== 'input' || task.kind === 'example') {
      shell.speak([message]);
      return;
    }
    shell.speak([message, `${termsText(steps[stepIndex])} gleich wie viel?`]);
  }

  function showParents(): void {
    const rows = STAGES.map((stage) => {
      const s = engine.stageState(stage);
      const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${s.mastery}` : '–';
      return `<tr><th>${stage}. ${escapeHtml(stageName(stage))}</th><td class="${s.unlocked ? '' : 'locked'}">${status}</td></tr>`;
    }).join('');
    shell.showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><tbody>${rows}</tbody></table>
       <p class="legend">„übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je Aufgabe, die beim ersten Versuch ohne Hilfe
       ganz richtig ist; Fehler ziehen nichts ab. „gelernt“ = nächste Stufe frei: ab ${READY_MASTERY} Lernpunkten, wenn zuletzt
       mindestens ${READY_WINDOW_CORRECT} von ${WINDOW} Aufgaben mit mindestens ${MIN_DISTINCT} verschiedenen Zahlen richtig waren. „sicher“ ab
       ${SECURE_MASTERY} Lernpunkten und mindestens ${SECURE_WINDOW_CORRECT} von ${WINDOW} richtigen Aufgaben, sobald die Stufe nach mehr als
       ${SESSION_GAP_MS / 60_000} Minuten Pause wieder ohne Hilfe gelöst wird. Nach „Zwei Schritte – über den Zehner“ steht die Lücke manchmal
       hinten (23 + __ = 90), ab „Eine Zeile“ wird manchmal zuerst die Umkehraufgabe gewählt, bei „Direkt“ ohne Zehnerübergang
       manchmal die Probe gerechnet – jeweils erst nach einem eigenen Beispiel.
       Ein Stern je ${CORRECT_PER_STAR} richtige Aufgaben, ein Pokal je ${ROUND_TASKS} Aufgaben.</p>
       <label class="setting"><input type="checkbox" data-ref="soundToggle" ${ctx.settings.sound ? 'checked' : ''}/> Töne</label>
       <p><button type="button" class="btn danger" data-ref="reset">Fortschritt löschen (3 Sek. halten)</button></p>`,
      [{ label: 'Schließen', primary: true, action: () => {} }],
    );
    shell.ref<HTMLInputElement>('soundToggle').addEventListener('change', (e) => {
      ctx.settings.sound = (e.target as HTMLInputElement).checked;
      sound.enabled = ctx.settings.sound;
      ctx.saveSettings();
    });
    shell.holdToConfirm(shell.ref<HTMLButtonElement>('reset'), 3000, () => {
      clearProgress();
      shell.cancelPending();
      engine = new Engine(loadProgress(Date.now()));
      round = newRoundStats();
      shell.closeDialog(nextTask);
    });
  }

  renderScore();
  nextTask();

  return () => shell.dispose();
}
