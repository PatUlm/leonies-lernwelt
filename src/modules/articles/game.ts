import { plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { MARKED_IS_RIGHT } from '../../shared/game/texts';
import { escapeHtml } from '../../shared/html';
import type { ModuleContext, ModuleStats } from '../types';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS, SECURE_MASTERY, SECURE_WINDOW_CORRECT, SESSION_GAP_MS, STAGES,
  WINDOW,
  type AnswerResult, type RoundState, type Task,
} from './engine';
import { BADGE_NAMES, STAGE_NAMES, statsFromProgress } from './stats';
import { clearProgress, loadProgress, saveProgress } from './storage';
import { cardSpeech, confirmation, explanation, help, mistake, question, storyLines } from './texts';
import { shout } from './words';

const CORRECT_DELAY_MS = 1500;
const STAR_DELAY_MS = 900;
const GAP = '___';

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="word-card" data-ref="card"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="message-text" data-ref="message"></span>
    </p>
    <div class="answers" data-ref="answers"></div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function articleStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

export function mountArticleGame(root: HTMLElement, ctx: ModuleContext): () => void {
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
  let engine = new Engine(loadProgress(Date.now()));
  let task: Task;
  let phase: 'question' | 'feedback' = 'question';
  let helpUsed = false;
  /** An example's answers react only after a moment: she listens before tapping. */
  let locked = false;
  let buttons: HTMLButtonElement[] = [];
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
    phase = 'question';
    helpUsed = false;
    afterFeedback = null;
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(task.kind !== 'example');

    buttons = task.options.map((option, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = task.variant === 'sentence' ? 'answer word-chip' : 'answer';
      b.textContent = task.variant === 'sentence' ? shout(option) : option;
      b.addEventListener('click', () => onChoice(i));
      return b;
    });
    renderCard(null);
    ui.answers.className = `answers word-answers options-${task.options.length}`;
    ui.answers.replaceChildren(...(task.variant === 'sentence' ? [] : buttons));
    if (task.kind === 'example') {
      // The right answer lights up only once the explanation has been read.
      const shown = task;
      locked = true;
      setMessage(explanation(task), 'explain');
      shell.explain([ui.message.textContent ?? ''], {
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

  /** The card with picture and word; `filled` puts the right article into the gap. */
  function renderCard(filled: string | null): void {
    const emoji = task.emoji ? `<span class="word-emoji" aria-hidden="true">${task.emoji}</span>` : '';
    // At the start of a sentence the options are already capitalised.
    const gap = () =>
      filled === null ? `<span class="gap">${GAP}</span>` : `<span class="gap filled">${escapeHtml(filled)}</span>`;
    const word = escapeHtml(task.word);
    switch (task.variant) {
      case 'article':
        ui.card.innerHTML = `${emoji}<span class="word-line">${gap()} ${word}</span>`;
        break;
      case 'indefinite': {
        const bridge = task.showDefinite ? `<span class="word-bridge">${escapeHtml(`${task.article} ${task.word}`)}</span>` : '';
        ui.card.innerHTML = `${emoji}${bridge}<span class="word-line">${gap()} ${word}</span>`;
        break;
      }
      case 'noun':
        ui.card.innerHTML = `<span class="word-line word-shout">${escapeHtml(shout(task.word))}</span>`;
        break;
      case 'sentence': {
        // The words are the answer buttons; they keep their marks after answering.
        const line = document.createElement('div');
        line.className = 'sentence';
        line.append(...buttons);
        ui.card.replaceChildren(line);
        break;
      }
      case 'story': {
        // Each sentence with the picture of its thing: twice the same, or a second one joining.
        const lines = storyLines(task, '\u0000').map((s) => escapeHtml(s).replace('\u0000', gap()));
        const emojis = [task.story!.before?.emoji ?? task.emoji, task.emoji];
        const rows = lines.map((line, i) =>
          `<span class="story-row"><span class="story-emoji" aria-hidden="true">${emojis[i]}</span><span class="story-line">${line}</span></span>`);
        ui.card.innerHTML = `<span class="story">${rows.join('')}</span>`;
        break;
      }
    }
    ui.card.className = `word-card card-${task.variant}`;
  }

  function onChoice(index: number): void {
    if (phase !== 'question' || locked || !shell.answersReady) return;
    if (task.kind === 'example' && index !== task.correctIndex) {
      // Before the mark the explanation goes on; it is no mistake.
      if (buttons[task.correctIndex].classList.contains('suggested')) {
        setMessage(MARKED_IS_RIGHT, 'explain');
        shell.speak([MARKED_IS_RIGHT]);
      }
      return;
    }
    phase = 'feedback';
    for (const b of buttons) b.disabled = true;
    shell.stopSpeaking();
    const result = engine.answer(task, index, helpUsed);
    buttons[task.correctIndex].classList.add('correct');
    buttons.forEach((b, i) => {
      if (i !== task.correctIndex) b.classList.add(i === index ? 'wrong' : 'faded');
    });
    finish(result);
  }

  function finish(result: AnswerResult): void {
    saveProgress(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) pendingToast = `Neu: ${result.unlocked.map((s) => STAGE_NAMES[s]).join(', ')}`;
    round.secured.push(...result.secured.map((s) => BADGE_NAMES[s]));
    if (task.variant === 'article' || task.variant === 'indefinite' || task.variant === 'story') {
      renderCard(task.options[task.correctIndex]);
    }

    if (result.ok) {
      const lead = task.kind === 'example' ? 'Genau!' : helpUsed ? 'Gemeinsam geschafft!' : 'Richtig!';
      setMessage(`${lead} ${confirmation(task)}`, 'good');
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
    setMessage(`Schauen wir zusammen. ${mistake(task)}`, 'explain');
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
    const lines = [`<p class="round-score">${summary.points} Punkte · ${plural(summary.correct, 'Wort', 'Wörter')} allein richtig</p>`];
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

  // --- tools -------------------------------------------------------------------

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  function showHelp(): void {
    if (phase !== 'question' || task.kind === 'example') return;
    helpUsed = true;
    setMessage(help(task), 'explain');
    shell.speak([help(task)]);
  }

  /** Question, then card and answers one after another, each highlighted while spoken. */
  function readAloud(): void {
    const message = ui.message.textContent ?? '';
    if (phase !== 'question' || task.kind === 'example') {
      shell.speak([message]);
      return;
    }
    const sentence = task.variant === 'sentence';
    const parts = sentence ? [message, ...task.options] : [message, cardSpeech(task), ...task.options];
    const first = sentence ? 1 : 2;
    shell.speak(parts, (i) => buttons.forEach((b, j) => b.classList.toggle('speaking', j === i - first)));
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
       <p class="legend">„übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je selbstständig richtige Antwort,
       Fehler ziehen nichts ab. „gelernt“ = nächste Stufe frei: ab ${READY_MASTERY} Lernpunkten, wenn zuletzt
       mindestens ${READY_WINDOW_CORRECT} von ${WINDOW} Antworten mit verschiedenen Wörtern richtig waren. „sicher“ ab ${SECURE_MASTERY}
       Lernpunkten und mindestens ${SECURE_WINDOW_CORRECT} von ${WINDOW} richtigen Antworten, sobald die Stufe nach mehr als
       ${SESSION_GAP_MS / 60_000} Minuten Pause wieder ohne Hilfe richtig gelöst wird. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten,
       ein Pokal je ${ROUND_TASKS} Aufgaben.</p>
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
