import { plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { MARKED_IS_RIGHT } from '../../shared/game/texts';
import { escapeHtml } from '../../shared/html';
import type { ModuleContext, ModuleStats } from '../types';
import { EIGHTHS, LENGTH_LABELS, NAMES, filledRow, type Value } from './content';
import {
  CORRECT_PER_STAR, Engine, INTRO_MASTERY, MASTERY_CORRECT, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS, SECURE_MASTERY,
  SECURE_WINDOW_CORRECT, SESSION_GAP_MS, STAGES, STEP_MASTERY, WINDOW,
  type AnswerResult, type RoundState, type Task,
} from './engine';
import { lengthSvg, notesLabel, notesSvg } from './notation';
import { RhythmPlayer, type PlayNote } from './player';
import { BADGE_NAMES, STAGE_NAMES, statsFromProgress } from './stats';
import { clearProgress, loadProgress, saveProgress } from './storage';
import { PRAISE, confirmation, explanation, help, mistake, question, type Text } from './texts';

const CORRECT_DELAY_MS = 1800;
const STAR_DELAY_MS = 900;

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="word-card notes-card" data-ref="card"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="message-text" data-ref="message"></span>
    </p>
    <div class="answers" data-ref="answers"></div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function notesStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

export function mountNotesGame(root: HTMLElement, ctx: ModuleContext): () => void {
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

  const { sound } = ctx;
  const player = new RhythmPlayer();
  let engine = new Engine(loadProgress(Date.now()));
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
    player.forget();
    player.stop();
    engine.touch(Date.now());
    task = engine.nextTask();
    saveProgress(engine.progress);
    renderScore();
    phase = 'question';
    helpUsed = false;
    afterFeedback = null;
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(task.kind !== 'example');

    buttons = task.options.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `answer notes-answer stage-${task.stage}`;
      b.addEventListener('click', () => onChoice(i));
      return b;
    });
    renderOptions();
    const kind = task.stage === 1 ? ' length-answers' : '';
    ui.answers.className = `answers notes-answers options-${task.options.length}${kind}`;
    ui.answers.replaceChildren(...buttons);
    renderCard(null);

    if (task.kind === 'example') {
      // The right answer lights up only once the explanation has been read.
      const shown = task;
      locked = true;
      setMessage(explanation(task), 'explain');
      shell.explain(message, {
        unlock: () => task === shown && (locked = false),
        reveal: () => task === shown && phase === 'question' && buttons[task.correctIndex].classList.add('suggested'),
      });
    } else {
      locked = false;
      setMessage(question(task), 'question');
    }

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  function onChoice(index: number): void {
    if (phase !== 'question' || locked || !shell.answersReady) return;
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
    player.stop();
    const result = engine.answer(task, index, helpUsed);
    renderCard(task.value);
    buttons.forEach((b, i) => {
      b.disabled = true;
      b.classList.remove('suggested');
      if (i === task.correctIndex) b.classList.add('correct');
      else b.classList.add(i === index ? 'wrong' : 'faded');
    });
    finish(result, index);
  }

  function finish(result: AnswerResult, chosen: number): void {
    saveProgress(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) pendingToast = `Neu: ${result.unlocked.map((s) => STAGE_NAMES[s]).join(', ')}`;
    round.secured.push(...result.secured.map((s) => BADGE_NAMES[s]));

    if (result.ok) {
      const lead = task.kind === 'example' ? 'Genau!' : helpUsed ? 'Gemeinsam geschafft!' : PRAISE[praise++ % PRAISE.length];
      setMessage(confirmation(lead, task), 'good');
      if (result.streak) shell.toast(`${result.streak} hintereinander geschafft!`);
      sound.correct();
      if (result.points) shell.floatPoints(result.points);
      let delay = CORRECT_DELAY_MS;
      if (result.starEarned) {
        shell.celebrate();
        sound.star();
        delay += STAR_DELAY_MS;
      }
      // "Anhören" during the feedback is heard to the end.
      shell.later(() => player.whenDone(() => shell.whenIdle(() => afterAnswer(result))), delay);
      return;
    }
    // Read aloud only on request (the speaker), as in the other modules.
    setMessage(mistake(task, chosen), 'explain');
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
    player.stop();
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

  // --- card and answers --------------------------------------------------------

  /** What the card shows: the note, the length or the two beats; `filled` is the answer once given. */
  function renderCard(filled: Value | null): void {
    let content: string;
    // The drawing as words, for a screen reader.
    let label = notesLabel([task.value]);
    switch (task.stage) {
      case 1:
        content = notesSvg([task.value], { fields: filled !== null, className: 'card-notes' });
        break;
      case 2:
        content = `<span class="length" data-note="0">${lengthSvg(task.value, 'card-length')}<span class="length-label">${escapeHtml(LENGTH_LABELS[task.value])}</span></span>`;
        label = LENGTH_LABELS[task.value];
        break;
      case 3: {
        // The fields always stand under the notes, the gap shows the empty part.
        const row = task.row!;
        const notes = filled === null ? row.notes : filledRow(row, filled);
        content = filled === null
          ? notesSvg(notes, { fields: true, gap: row.gap, className: 'card-row' })
          : notesSvg(notes, { fields: true, filled: row.gap, className: 'card-row' });
        label = `Zwei Schläge: ${notes.map((v, i) => (filled === null && i === row.gap ? 'Lücke' : notesLabel([v]))).join(', ')}`;
        break;
      }
    }
    ui.card.innerHTML = `<div class="notes-show" data-ref="show" role="img" aria-label="${escapeHtml(label)}">${content}</div>
      <button type="button" class="listen-button" data-ref="listen"><span aria-hidden="true">♪</span> Anhören</button>`;
    ui.card.querySelector('[data-ref="listen"]')!.addEventListener('click', () => listen(filled));
  }

  function renderOptions(): void {
    // Stage 1: the lengths side by side on one scale, the room of the longest.
    const room = Math.max(...task.options.map((value) => Math.ceil(EIGHTHS[value] / 2)));
    task.options.forEach((value, i) => {
      const b = buttons[i];
      if (task.stage === 1) {
        b.innerHTML = `<span class="length">${lengthSvg(value, '', room)}<span class="length-label">${escapeHtml(LENGTH_LABELS[value])}</span></span>`;
        b.setAttribute('aria-label', LENGTH_LABELS[value]);
      } else {
        b.innerHTML = notesSvg([value]);
        b.setAttribute('aria-label', NAMES[value]);
      }
    });
  }

  /** Plays what the card shows; the note being heard lights up. */
  function listen(filled: Value | null): void {
    if (player.playing) {
      player.stop();
      return;
    }
    shell.stopSpeaking();
    let notes: PlayNote[];
    if (task.stage === 3) {
      const row = task.row!;
      notes = (filled === null ? row.notes : filledRow(row, filled)).map((value, i) => ({ value, silent: filled === null && i === row.gap }));
    } else {
      notes = [{ value: task.value }];
    }
    const show = ui.card.querySelector('[data-ref="show"]')!;
    const button = ui.card.querySelector<HTMLButtonElement>('[data-ref="listen"]')!;
    button.classList.add('playing');
    player.play(notes, (i) => {
      show.querySelectorAll('[data-note]').forEach((n) => n.classList.toggle('playing', Number((n as HTMLElement).dataset.note) === i));
      if (i === -1) button.classList.remove('playing');
    });
  }

  // --- tools -------------------------------------------------------------------

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  /** Help costs half the points. */
  function showHelp(): void {
    // `task` is unset until the first task is shown.
    if (!task || phase !== 'question' || task.kind === 'example' || locked) return;
    helpUsed = true;
    player.stop();
    setMessage(help(task), 'explain');
    shell.speak(message);
  }

  function readAloud(): void {
    if (!task) return;
    player.stop();
    shell.speak(message);
  }

  function showParents(): void {
    const rows = STAGES.map((stage) => {
      const s = engine.stageState(stage);
      const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${s.mastery}` : '–';
      return `<tr><th>${stage}. ${escapeHtml(STAGE_NAMES[stage])}</th><td class="${s.unlocked ? '' : 'locked'}">${status}</td></tr>`;
    }).join('');
    shell.showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><tbody>${rows}</tbody></table>
       <p class="legend">Halbe, Viertel- und Achtelnoten und ihre Länge in Schlägen (Viertel = 1 Schlag); noch keine ganze Note
       und keine Pausen. Abgefragt wird nur, was vorher erklärt wurde. Stufe 1: zur Note die Länge wählen – erst Viertel und
       Achtel, ab ${STEP_MASTERY} Lernpunkten kommt die halbe Note mit einem eigenen Beispiel dazu. Stufe 2: zur Länge die Note
       wählen. Stufe 3: die Note einsetzen, die zu zwei Schlägen fehlt; die Schlagfelder stehen immer darunter. Bis
       ${INTRO_MASTERY} Lernpunkte fehlt die letzte Note, danach eine beliebige, und ab ${STEP_MASTERY} kommen auch zwei leere
       Schläge (halbe Note) dazu. „Anhören“ spielt die Noten über einem leisen Schlag, auch wenn die Töne aus sind.
       „übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je selbstständig richtige Antwort, Fehler ziehen nichts ab.
       „gelernt“ = nächste Stufe frei: ab ${READY_MASTERY} Lernpunkten, wenn zuletzt mindestens ${READY_WINDOW_CORRECT} von ${WINDOW}
       Antworten richtig waren und jede Note dabei war. „sicher“ ab ${SECURE_MASTERY} Lernpunkten und mindestens
       ${SECURE_WINDOW_CORRECT} von ${WINDOW} richtigen Antworten, sobald die Stufe nach mehr als ${SESSION_GAP_MS / 60_000} Minuten
       Pause wieder ohne Hilfe richtig gelöst wird. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten, ein Pokal je
       ${ROUND_TASKS} Aufgaben.</p>
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
      player.forget();
      engine = new Engine(loadProgress(Date.now()));
      round = newRoundStats();
      shell.closeDialog(nextTask);
    });
  }

  renderScore();
  nextTask();

  return () => {
    player.dispose();
    shell.dispose();
  };
}
