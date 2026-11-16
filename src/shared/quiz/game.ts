import type { ModuleContext, ModuleStats } from '../../modules/types';
import { plainStar } from '../decor';
import { GameShell } from '../game/shell';
import { MARKED_IS_RIGHT } from '../game/texts';
import { escapeHtml } from '../html';
import type { QuizCourse, Text } from './course';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS, SECURE_MASTERY,
  SECURE_WINDOW_CORRECT, SESSION_GAP_MS, WINDOW, stageNumbers,
  type AnswerResult, type RoundState, type Task,
} from './engine';
import { statsFromProgress } from './stats';
import { QuizStore } from './storage';
import { ONE_GONE, PRAISE } from './texts';

const CORRECT_DELAY_MS = 1800;
const STAR_DELAY_MS = 900;

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="word-card quiz-card" data-ref="card"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="message-text" data-ref="message"></span>
    </p>
    <div class="answers" data-ref="answers"></div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function quizStats(course: QuizCourse): ModuleStats {
  const now = Date.now();
  return statsFromProgress(course, new QuizStore(course, course.storageKey).load(now), now);
}

export function mountQuiz(course: QuizCourse, root: HTMLElement, ctx: ModuleContext): () => void {
  const store = new QuizStore(course, course.storageKey);
  const stages = stageNumbers(course);
  const shell = new GameShell(root, {
    className: 'word-game',
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
    next: shell.ref<HTMLButtonElement>('next'),
  };
  ui.card.classList.add(course.cardClass);

  const { sound } = ctx;
  let engine = new Engine(course, store.load(Date.now()));
  let task: Task;
  let phase: 'question' | 'feedback' = 'question';
  let helpUsed = false;
  /** Index into PRAISE: the next one, so the same praise does not come twice in a row. */
  let praise = 0;
  /** An example's answers react only after a moment: she listens before tapping. */
  let locked = false;
  let buttons: HTMLButtonElement[] = [];
  let message: Text = [];
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
    store.save(engine.progress);
    renderScore();
    phase = 'question';
    helpUsed = false;
    afterFeedback = null;
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(task.kind !== 'example');

    buttons = task.options.map((answer, i) => {
      const b = document.createElement('button');
      const { html, label } = course.option(task.stage, answer);
      b.type = 'button';
      b.className = 'answer quiz-answer';
      b.innerHTML = html;
      b.setAttribute('aria-label', label);
      b.dataset.answer = answer;
      b.addEventListener('click', () => onChoice(i));
      return b;
    });
    const text = course.textAnswers?.(task.stage) ? ' text-answers' : '';
    ui.answers.className = `answers quiz-answers options-${task.options.length}${text}`;
    ui.answers.replaceChildren(...buttons);
    renderCard(false);

    if (task.kind === 'example') {
      // The right answer lights up only once the explanation has been read.
      const shown = task;
      locked = true;
      setMessage(course.explanation(task), 'explain');
      shell.explain(message, {
        unlock: () => task === shown && (locked = false),
        reveal: () => task === shown && phase === 'question' && buttons[task.correctIndex].classList.add('suggested'),
      });
    } else {
      locked = false;
      setMessage(course.question(task), 'question');
    }

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  function onChoice(index: number): void {
    if (phase !== 'question' || locked || !shell.answersReady || buttons[index].disabled) return;
    if (task.kind === 'example' && index !== task.correctIndex) {
      // Before the mark the explanation goes on; it is no mistake.
      if (buttons[task.correctIndex].classList.contains('suggested')) {
        setMessage([MARKED_IS_RIGHT], 'explain');
        shell.speak([MARKED_IS_RIGHT]);
      }
      return;
    }
    phase = 'feedback';
    shell.stopSpeaking();
    const result = engine.answer(task, index, helpUsed);
    renderCard(true);
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.classList.remove('suggested');
      if (i === task.correctIndex) b.classList.add('correct');
      else b.classList.add(i === index ? 'wrong' : 'faded');
    });
    finish(result, index);
  }

  function finish(result: AnswerResult, chosen: number): void {
    store.save(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) pendingToast = `Neu: ${result.unlocked.map((s) => course.stages[s - 1].name).join(', ')}`;
    round.secured.push(...result.secured.map((s) => course.stages[s - 1].badge));

    if (result.ok) {
      const lead = task.kind === 'example' ? 'Genau!' : helpUsed ? 'Gemeinsam geschafft!' : PRAISE[praise++ % PRAISE.length];
      setMessage(course.confirmation(lead, task), 'good');
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
      return;
    }
    // Read aloud only on request (the speaker), as in the other modules.
    setMessage(course.mistake(task, task.options[chosen]), 'explain');
    showNext(() => afterAnswer(result));
  }

  /** "Weiter" after a mistake, active after a moment: time to look at the explanation. */
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

  function setMessage(text: Text, tone: 'question' | 'good' | 'explain'): void {
    message = text;
    ui.message.textContent = text.join(' ');
    ui.messageBox.className = `message ${tone}`;
  }

  function renderCard(answered: boolean): void {
    const { html, label } = course.card(task, answered);
    ui.card.innerHTML = `<div class="quiz-show" role="img" aria-label="${escapeHtml(label)}">${html}</div>`;
  }

  // --- tools -------------------------------------------------------------------

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  /** One wrong answer goes; false if only one is left. */
  function dropWrongOption(): boolean {
    const open = buttons.filter((b, i) => i !== task.correctIndex && !b.disabled);
    if (open.length < 2) return false;
    const b = open[Math.floor(Math.random() * open.length)];
    b.disabled = true;
    b.classList.add('faded');
    return true;
  }

  /** Help costs half the points: a hint, or one wrong answer goes. */
  function showHelp(): void {
    // `task` is unset until the first task is shown.
    if (!task || phase !== 'question' || task.kind === 'example' || locked) return;
    const hint = course.help(task);
    if (hint) {
      helpUsed = true;
      setMessage(hint, 'explain');
    } else {
      if (helpUsed || !dropWrongOption()) return;
      helpUsed = true;
      setMessage([...course.question(task), ONE_GONE], 'explain');
    }
    shell.speak(message);
  }

  function readAloud(): void {
    if (!task) return;
    shell.speak(message);
  }

  function showParents(): void {
    const rows = stages.map((stage) => {
      const s = engine.stageState(stage);
      const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${s.mastery}` : '–';
      return `<tr><th>${stage}. ${escapeHtml(course.stages[stage - 1].name)}</th><td class="${s.unlocked ? '' : 'locked'}">${status}</td></tr>`;
    }).join('');
    shell.showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><tbody>${rows}</tbody></table>
       <p class="legend">${course.legend} Abgefragt wird nur, was vorher erklärt wurde: Jede Frage kommt erst nach ihrem
       Beispiel, neue Fragen einer Stufe in kleinen Gruppen. „übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je
       selbstständig richtige Antwort, Fehler ziehen nichts ab. „gelernt“ = nächste Stufe frei: alle Fragen der Stufe sind da,
       ab ${READY_MASTERY} Lernpunkten, wenn zuletzt mindestens ${READY_WINDOW_CORRECT} von ${WINDOW} Antworten mit
       verschiedenen Fragen richtig waren. „sicher“ ab ${SECURE_MASTERY} Lernpunkten und mindestens ${SECURE_WINDOW_CORRECT}
       von ${WINDOW} richtigen Antworten, sobald die Stufe nach mehr als ${SESSION_GAP_MS / 60_000} Minuten Pause wieder ohne
       Hilfe richtig gelöst wird. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten, ein Pokal je ${ROUND_TASKS} Aufgaben.</p>
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
      store.clear();
      shell.cancelPending();
      engine = new Engine(course, store.load(Date.now()));
      round = newRoundStats();
      shell.closeDialog(nextTask);
    });
  }

  renderScore();
  nextTask();

  return () => shell.dispose();
}
