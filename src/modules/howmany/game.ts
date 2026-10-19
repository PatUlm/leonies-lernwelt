import { plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { escapeHtml } from '../../shared/html';
import type { ModuleContext, ModuleStats } from '../types';
import { questionText } from './content';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, MIN_DISTINCT_COUNTS, ONE_SHARE, READY_MASTERY, READY_WINDOW_CORRECT, ROUND_TASKS,
  SECURE_MASTERY, SECURE_WINDOW_CORRECT, SESSION_GAP_MS, STAGES, WINDOW, diagnose,
  type AnswerResult, type RoundState, type Task,
} from './engine';
import { picture } from './pictures';
import { BADGE_NAMES, STAGE_NAMES, statsFromProgress } from './stats';
import { clearProgress, loadProgress, saveProgress } from './storage';
import {
  BUILD_PROMPT, COMPLETE_HELP, HINTS, MARKED_CARD, answer, confirmation, explanation, help, question, reveal, type Text,
} from './texts';

const CORRECT_DELAY_MS = 1800;
const STAR_DELAY_MS = 900;

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="word-card count-card" data-ref="card"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="message-text" data-ref="message"></span>
    </p>
    <div class="answers build-answers" data-ref="answers">
      <div class="build-line" data-ref="line" lang="en"></div>
      <div class="build-pool" data-ref="pool" lang="en"></div>
      <button class="check" type="button" data-ref="check">Prüfen</button>
    </div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** German text with the English sentences marked, so they stand out and are read in English. */
function textHtml(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? escapeHtml(p) : `<span class="en" lang="en">${escapeHtml(p.en)}</span>`)).join(' ');
}

export function howManyStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

/** build: placing cards; wait: a shown sentence waits for "Weiter"; done: the sentence is right. */
type Phase = 'build' | 'wait' | 'done';

export function mountHowManyGame(root: HTMLElement, ctx: ModuleContext): () => void {
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
    line: shell.ref('line'),
    pool: shell.ref('pool'),
    check: shell.ref<HTMLButtonElement>('check'),
    next: shell.ref<HTMLButtonElement>('next'),
  };

  const { sound } = ctx;
  let engine = new Engine(loadProgress(Date.now()));
  let task: Task;
  let phase: Phase = 'build';
  /** Per place in the sentence: the index of the card on it, or null. */
  let slots: (number | null)[] = [];
  /** Places found right by a check: they stay. */
  let fixed = new Set<number>();
  /** Places emptied by a check because their card was wrong, until filled again. */
  let wrongSlots = new Set<number>();
  /** The card help or an example lights up. */
  let suggested: number | null = null;
  let checks = 0;
  let helpUsed = false;
  let mistake = false;
  /** A mistake before any help: the task stays her own try. */
  let mistakeAlone = false;
  /** An example's cards react only after a moment: she listens before tapping. */
  let locked = false;
  /** An example's explanation has been read: its cards light up one by one. */
  let marked = false;
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
    saveProgress(engine.progress);
    renderScore();
    phase = 'build';
    slots = task.answer.map(() => null);
    fixed = new Set();
    wrongSlots = new Set();
    suggested = null;
    checks = 0;
    helpUsed = false;
    mistake = false;
    mistakeAlone = false;
    marked = false;
    afterFeedback = null;
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(task.kind !== 'example');
    renderCard();

    if (task.kind === 'example') {
      const shown = task;
      locked = true;
      setMessage(explanation(task.stage, task.problem), 'explain');
      shell.explain(message, {
        unlock: () => task === shown && (locked = false),
        reveal: () => {
          if (task !== shown || phase !== 'build') return;
          marked = true;
          markNext();
          renderSentence();
        },
      });
    } else {
      locked = false;
      setMessage([BUILD_PROMPT], 'question');
      shell.speak(question(task.problem));
    }
    renderSentence();

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  /** In an example: the card for the first open place lights up. */
  function markNext(): void {
    const open = slots.indexOf(null);
    suggested = open < 0 ? null : cardFor(task.answer[open]);
  }

  /** A free card with this word. */
  function cardFor(word: string): number | null {
    const index = task.cards.findIndex((w, i) => w === word && !slots.includes(i));
    return index < 0 ? null : index;
  }

  function onCard(index: number): void {
    if (phase !== 'build' || locked || !shell.answersReady || slots.includes(index)) return;
    const open = slots.indexOf(null);
    if (open < 0) return;
    if (task.kind === 'example' && task.cards[index] !== task.answer[open]) {
      // Not a mistake: the card that lights up is the next one.
      if (marked) {
        setMessage([MARKED_CARD], 'explain');
        shell.speak([MARKED_CARD]);
      }
      return;
    }
    slots[open] = index;
    wrongSlots.delete(open);
    if (suggested === index) suggested = null;
    if (task.kind === 'example') {
      if (marked) markNext();
      if (!slots.includes(null)) {
        complete(false);
        return;
      }
    }
    renderSentence();
  }

  /** A card in the sentence goes back, unless a check found it right. */
  function onSlot(slot: number): void {
    if (phase !== 'build' || locked || task.kind === 'example' || fixed.has(slot) || slots[slot] === null) return;
    slots[slot] = null;
    renderSentence();
  }

  function placedWords(): string[] {
    return slots.map((i) => (i === null ? '' : task.cards[i]));
  }

  function onCheck(): void {
    if (phase !== 'build' || locked || task.kind === 'example' || slots.includes(null) || !shell.answersReady) return;
    const placed = placedWords();
    if (placed.every((w, i) => w === task.answer[i])) {
      complete(false);
      return;
    }
    checks += 1;
    mistake = true;
    if (!helpUsed) mistakeAlone = true;
    suggested = null;
    if (checks === 1) {
      // Right cards stay; wrong ones go back, their places are marked.
      const hint = HINTS[diagnose(task.answer, placed)];
      placed.forEach((w, i) => {
        if (w === task.answer[i]) {
          fixed.add(i);
        } else {
          slots[i] = null;
          wrongSlots.add(i);
        }
      });
      renderSentence();
      setMessage([hint], 'explain');
      shell.speak([hint]);
      return;
    }
    // Second wrong check: the sentence is shown, she moves on with "Weiter".
    showAnswer();
    phase = 'wait';
    renderSentence();
    setMessage(reveal(task.problem), 'explain');
    shell.speak(message);
    showNext(() => complete(true));
  }

  /** Puts the right cards on every place. */
  function showAnswer(): void {
    slots = task.answer.map(() => null);
    task.answer.forEach((word, i) => (slots[i] = cardFor(word)));
    wrongSlots = new Set();
  }

  function complete(shown: boolean): void {
    phase = 'done';
    suggested = null;
    renderSentence();
    const result = engine.answer(task, { mistake, helped: helpUsed, helpFirst: helpUsed && !mistakeAlone, shown });
    finish(result, shown);
  }

  function finish(result: AnswerResult, shown: boolean): void {
    saveProgress(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) pendingToast = `Neu: ${result.unlocked.map((s) => STAGE_NAMES[s]).join(', ')}`;
    round.secured.push(...result.secured.map((s) => BADGE_NAMES[s]));

    const lead = task.kind === 'example' ? 'Genau!' : result.ok ? 'Richtig!' : 'Gemeinsam geschafft!';
    setMessage(confirmation(lead, task.problem), 'good');
    // Every sentence ends heard once more; a shown one was just read.
    if (!shown) shell.speak(answer(task.problem));
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

  /** "Weiter" after a shown sentence, active after a moment: time to look. */
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
    const lines = [`<p class="round-score">${summary.points} Punkte · ${plural(summary.correct, 'Satz', 'Sätze')} allein richtig</p>`];
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

  // --- card and sentence -------------------------------------------------------

  function renderCard(): void {
    ui.card.innerHTML = `${picture(task.problem)}
      <p class="count-question" lang="en">${escapeHtml(questionText(task.problem.noun))}</p>
      <button type="button" class="listen-button" data-ref="listen"><span aria-hidden="true">🔊</span> Frage hören</button>`;
    ui.card.querySelector('[data-ref="listen"]')!.addEventListener('click', () => shell.speak(question(task.problem)));
  }

  /** The places of the sentence (first word with a capital letter, the full stop fixed) and the free cards. */
  function renderSentence(): void {
    // The buttons are rebuilt: focus on one of them moves to the next free card, or to "Prüfen" once the sentence is full.
    const focused = document.activeElement;
    const hadFocus = focused instanceof HTMLElement && (ui.line.contains(focused) || ui.pool.contains(focused));
    const done = phase !== 'build';
    const places = slots.map((card, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const state = done ? (phase === 'wait' ? 'shown' : 'ok') : fixed.has(i) ? 'ok' : wrongSlots.has(i) ? 'wrong' : card === null ? 'empty' : 'filled';
      b.className = `build-slot ${state}`;
      const word = card === null ? '' : task.cards[card];
      b.textContent = i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
      b.setAttribute('aria-label', word ? `${word}, zurücklegen` : `Platz ${i + 1}, frei`);
      b.disabled = done || fixed.has(i) || card === null || task.kind === 'example';
      b.addEventListener('click', () => onSlot(i));
      return b;
    });
    const stop = document.createElement('span');
    stop.className = 'build-stop';
    stop.textContent = '.';
    ui.line.replaceChildren(...places, stop);

    ui.pool.replaceChildren(
      ...task.cards.map((word, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const used = slots.includes(i);
        b.className = `answer build-card${used ? ' used' : ''}${i === suggested ? ' suggested' : ''}`;
        b.textContent = word;
        b.disabled = done || used;
        b.addEventListener('click', () => onCard(i));
        return b;
      }),
    );
    ui.check.hidden = task.kind === 'example';
    ui.check.disabled = done || slots.includes(null);
    if (hadFocus) {
      const full = !ui.check.disabled && !ui.check.hidden;
      (full ? ui.check : ui.pool.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    }
  }

  // --- tools -------------------------------------------------------------------

  ui.check.addEventListener('click', onCheck);

  ui.next.addEventListener('click', () => {
    const continueWith = afterFeedback;
    afterFeedback = null;
    ui.next.hidden = true;
    continueWith?.();
  });

  /** Help costs half the points: the first place still wrong is cleared and its card lights up. */
  function showHelp(): void {
    // `task` is unset until the first task is shown.
    if (!task || phase !== 'build' || task.kind === 'example' || locked) return;
    const slot = slots.findIndex((card, i) => card === null || task.cards[card] !== task.answer[i]);
    if (slot < 0) {
      setMessage([COMPLETE_HELP], 'explain');
      shell.speak(message);
      return;
    }
    helpUsed = true;
    // Cards after the wrong place go back too: the sentence fills from the left.
    for (let i = slot; i < slots.length; i++) if (!fixed.has(i)) slots[i] = null;
    suggested = cardFor(task.answer[slot]);
    renderSentence();
    setMessage([help(slot, task.problem)], 'explain');
    shell.speak(message);
  }

  /** While she builds: the English question, then the message; otherwise the message. */
  function readAloud(): void {
    if (!task) return;
    shell.speak(phase === 'build' && task.kind !== 'example' ? [...question(task.problem), ...message] : message);
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
       <p class="legend">Die Antwort auf „How many …?“ wird aus Wortkärtchen gebaut, mit 1 bis 5 Geistern, Katzen oder Hunden.
       Jede Stufe legt ein Kärtchen mehr dazu, das nicht passt: erst die andere Form des Nomens (ghost/ghosts), dann „is“
       oder „are“, dann eine falsche Zahl. Etwa ${Math.round(ONE_SHARE * 10)} von 10 Aufgaben zeigen genau eins.
       „übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je Satz, der beim ersten Prüfen ohne Hilfe stimmt; Fehler ziehen
       nichts ab. „gelernt“ = nächste Stufe frei: ab ${READY_MASTERY} Lernpunkten, wenn zuletzt mindestens
       ${READY_WINDOW_CORRECT} von ${WINDOW} Sätzen mit mindestens ${MIN_DISTINCT_COUNTS} verschiedenen Zahlen richtig waren.
       „sicher“ ab ${SECURE_MASTERY} Lernpunkten und mindestens ${SECURE_WINDOW_CORRECT} von ${WINDOW} richtigen Sätzen, sobald
       die Stufe nach mehr als ${SESSION_GAP_MS / 60_000} Minuten Pause wieder ohne Hilfe gelöst wird. Ein Stern je
       ${CORRECT_PER_STAR} richtige Sätze, ein Pokal je ${ROUND_TASKS} Aufgaben.</p>
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
