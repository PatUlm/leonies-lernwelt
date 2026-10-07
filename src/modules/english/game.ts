import { plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { escapeHtml } from '../../shared/html';
import { englishVoice, voicesReady } from '../../shared/speech';
import type { ModuleContext, ModuleStats } from '../types';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS, SECURE_MASTERY,
  SECURE_WINDOW_CORRECT, SESSION_GAP_MS, STAGES, WINDOW,
  type AnswerResult, type RoundState, type Task,
} from './engine';
import { SHAPES, picture, type Shape } from './pictures';
import { BADGE_NAMES, STAGE_NAMES, statsFromProgress } from './stats';
import { clearProgress, loadProgress, saveProgress } from './storage';
import { example, meaning, mistake, question, withoutEnglish, type Text } from './texts';

const CORRECT_DELAY_MS = 1500;
const STAR_DELAY_MS = 900;

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

/** German text with the English words marked, so they stand out and are read in English. */
function textHtml(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? escapeHtml(p) : `<span class="en" lang="en">${escapeHtml(p.en)}</span>`)).join('');
}

export function englishStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

export function mountEnglishGame(root: HTMLElement, ctx: ModuleContext): () => void {
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
  let shape: Shape = 'circle';
  let phase: 'question' | 'feedback' = 'question';
  let helpUsed = false;
  /** An example's answers react only after a moment: she listens before tapping. */
  let locked = false;
  let buttons: HTMLButtonElement[] = [];
  let message: Text = [];
  let pendingToast: string | null = null;
  let afterFeedback: (() => void) | null = null;
  let round = newRoundStats();
  let disposed = false;

  function newRoundStats(): { starsAtStart: number; secured: string[] } {
    return { starsAtStart: engine.stars, secured: [] };
  }

  /** `shown` lets the bar stay full on a just completed round until the next task. */
  function renderScore(shown: RoundState = engine.progress.round): void {
    shell.setScore(engine.stars, engine.progress.trophies);
    shell.setRound(shown.tasks, ROUND_TASKS, 'Aufgaben', `${shown.tasks} von ${ROUND_TASKS} Aufgaben bis zum Pokal`);
  }

  /** The English word, spoken by an English voice; `slow` for a careful second listen. */
  function sayWord(slow = false): void {
    if (engine.listen) shell.speak([{ en: task.word.en, slow }]);
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
    shell.setHelpEnabled(task.kind !== 'example');
    // A familiar colour now and then on another shape, so she knows the colour, not one card.
    shape = task.kind !== 'example' && engine.familiar(task.word) ? SHAPES[Math.floor(Math.random() * SHAPES.length)] : 'circle';

    buttons = task.options.map((option, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (task.variant === 'word') {
        b.className = 'answer en-answer';
        b.lang = 'en';
        b.textContent = option.en;
      } else {
        b.className = `answer picture-answer picture-${option.category}`;
        b.innerHTML = picture(option, shape);
        // The German name: it does not give the English word away.
        b.setAttribute('aria-label', option.category === 'number' ? String(option.value) : option.de);
      }
      b.addEventListener('click', () => onChoice(i));
      return b;
    });
    renderCard(false);
    ui.answers.className = `answers word-answers options-${task.options.length}`;
    ui.answers.replaceChildren(...buttons);
    if (task.kind === 'example') {
      // Explanation and word in one go; the right answer lights up once it has been read.
      const shown = task;
      locked = true;
      setMessage(example(task), 'explain');
      shell.explain(spoken(message), {
        unlock: () => task === shown && (locked = false),
        reveal: () => task === shown && phase === 'question' && buttons[task.correctIndex].classList.add('suggested'),
      });
    } else {
      locked = false;
      setMessage(question(task), 'question');
      if (task.variant === 'listen') sayWord();
    }

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  /**
   * Before the answer the card shows only what the task asks about: the
   * speaker, the written word or the picture. Examples and answered tasks
   * show the picture with its word.
   */
  function renderCard(revealed: boolean): void {
    const word = `<span class="en-word" lang="en">${escapeHtml(task.word.en)}</span>`;
    const listen = (big: boolean) =>
      engine.listen
        ? `<button type="button" class="listen-button${big ? ' big' : ''}" data-ref="listen"><span aria-hidden="true">🔊</span> Nochmal hören</button>`
        : '';
    let html: string;
    if (revealed || task.kind === 'example') html = `${picture(task.word, shape)}${word}${listen(false)}`;
    else if (task.variant === 'listen') html = listen(true);
    else if (task.variant === 'read') html = word;
    else html = picture(task.word, shape);
    ui.card.innerHTML = html;
    ui.card.className = `word-card english-card card-${task.variant}${revealed ? ' revealed' : ''}`;
    ui.card.querySelector('[data-ref="listen"]')?.addEventListener('click', () => sayWord());
  }

  function onChoice(index: number): void {
    if (phase !== 'question' || locked) return;
    if (task.kind === 'example' && index !== task.correctIndex) {
      // Before the mark the explanation goes on; it is no mistake.
      if (buttons[task.correctIndex].classList.contains('suggested')) {
        setMessage(['Schau noch mal: Der leuchtende Knopf ist richtig.'], 'explain');
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
    renderCard(true);

    if (result.ok) {
      // Every answer ends with the word heard once more; after a mistake within the explanation.
      sayWord();
      const lead = task.kind === 'example' ? 'Genau! ' : helpUsed ? 'Gemeinsam geschafft! ' : 'Richtig! ';
      setMessage([lead, ...meaning(task.word)], 'good');
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
    setMessage(['Schauen wir zusammen. ', ...mistake(task)], 'explain');
    const heard = task.variant === 'listen' && engine.listen ? [{ en: task.word.en }] : [];
    showNext(() => afterAnswer(result), [...spoken(message), ...heard]);
  }

  /** "Weiter" after a mistake, active after a moment; the explanation is read meanwhile. */
  function showNext(then: () => void, speech: Text): void {
    afterFeedback = then;
    ui.next.hidden = false;
    ui.next.disabled = true;
    shell.explain(speech, { unlock: () => afterFeedback === then && (ui.next.disabled = false) });
  }

  /** The message as spoken: without an English voice the English word is left out. */
  function spoken(text: Text): Text {
    return engine.listen ? text : [withoutEnglish(text)];
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

  function setMessage(text: Text, tone: 'question' | 'good' | 'explain'): void {
    message = text;
    ui.message.innerHTML = textHtml(text);
    ui.messageBox.className = `message ${tone}`;
  }

  // --- tools -------------------------------------------------------------------

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  /** Takes one wrong picture away (with three to choose from); returns whether it did. */
  function dropWrongOption(): boolean {
    const open = buttons.filter((b, i) => i !== task.correctIndex && !b.disabled);
    if (buttons.filter((b) => !b.disabled).length < 3 || !open.length) return false;
    const b = open[Math.floor(Math.random() * open.length)];
    b.disabled = true;
    b.classList.add('faded');
    return true;
  }

  /** Help costs half the points: one wrong answer goes, and she hears or gets a first letter. */
  function showHelp(): void {
    // `task` is still unset while the voice list loads.
    if (!task || phase !== 'question' || task.kind === 'example') return;
    helpUsed = true;
    const dropped = dropWrongOption() ? ' Eine falsche Antwort ist schon weg.' : '';
    if (task.variant === 'listen') {
      setMessage([`Hör noch einmal ganz genau hin.${dropped}`], 'explain');
    } else if (task.variant === 'read' && engine.listen) {
      setMessage([`Ich lese dir das Wort vor.${dropped}`], 'explain');
    } else if (task.variant === 'read') {
      setMessage([`Auf Deutsch fängt es mit „${task.word.de[0]}“ an.${dropped}`], 'explain');
    } else {
      setMessage([`Das Wort fängt mit „${task.word.en[0]}“ an.${dropped}`], 'explain');
    }
    // The help is read aloud; a word to hear or read follows slowly.
    const word = engine.listen && task.variant !== 'word' ? [{ en: task.word.en, slow: true }] : [];
    shell.speak([...spoken(message), ...word]);
  }

  /**
   * The message in German with English words in English. While the question
   * is open only a heard word is spoken again: a word to read or to pick stays
   * a reading task.
   */
  function readAloud(): void {
    if (!task) return;
    if (phase === 'question' && task.kind !== 'example') {
      shell.speak(task.variant === 'listen' && engine.listen ? [...message, { en: task.word.en }] : message);
      return;
    }
    shell.speak(spoken(message));
  }

  function showParents(): void {
    const rows = STAGES.map((stage) => {
      const s = engine.stageState(stage);
      const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${s.mastery}` : '–';
      return `<tr><th>${stage}. ${escapeHtml(STAGE_NAMES[stage])}</th><td class="${s.unlocked ? '' : 'locked'}">${status}</td></tr>`;
    }).join('');
    const voice = englishVoice();
    shell.showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><tbody>${rows}</tbody></table>
       <p class="legend">Englische Stimme: ${voice ? escapeHtml(voice.name) : 'keine auf diesem Gerät – die Wörter werden gelesen statt gehört'}.</p>
       <p class="legend">Neue Wörter kommen zu zweit oder dritt, jedes mit einem Beispiel. „übt 40“ = Lernpunkte der Stufe:
       +${MASTERY_CORRECT} je selbstständig richtige Antwort, Fehler ziehen nichts ab. „gelernt“ = nächste Stufe frei: alle
       Wörter der Stufe sind da, ab ${READY_MASTERY} Lernpunkten, wenn zuletzt mindestens ${READY_WINDOW_CORRECT} von ${WINDOW}
       Antworten mit verschiedenen Wörtern richtig waren. „sicher“ ab ${SECURE_MASTERY} Lernpunkten und mindestens
       ${SECURE_WINDOW_CORRECT} von ${WINDOW} richtigen Antworten, sobald die Stufe nach mehr als ${SESSION_GAP_MS / 60_000}
       Minuten Pause wieder ohne Hilfe richtig gelöst wird. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten, ein Pokal je
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
      const listen = engine.listen;
      engine = new Engine(loadProgress(Date.now()));
      engine.listen = listen;
      round = newRoundStats();
      shell.closeDialog(nextTask);
    });
  }

  renderScore();
  // The first task waits for the voice list: without an English voice the words are read.
  void voicesReady().then(() => {
    if (disposed) return;
    engine.listen = !!englishVoice();
    if (!engine.listen) pendingToast = 'Auf diesem Gerät gibt es keine englische Stimme. Wir lesen die Wörter.';
    nextTask();
  });

  return () => {
    disposed = true;
    shell.dispose();
  };
}
