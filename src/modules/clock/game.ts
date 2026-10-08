import { afternoonScene, eveningScene, forenoonScene, nightScene, noonScene, plainStar } from '../../shared/decor';
import { GameShell } from '../../shared/game/shell';
import { MARKED_IS_RIGHT } from '../../shared/game/texts';
import { createKeypad, type Keypad } from '../../shared/keypad';
import { Stopwatch } from '../../shared/stopwatch';
import type { ModuleContext, ModuleStats } from '../types';
import { AnalogClock } from './clock';
import { contextSentence, hour24, type DayContext } from './daytime';
import {
  CORRECT_PER_STAR, Engine, MASTERY_CORRECT, MASTERY_FAST_BONUS, MASTERY_WRONG, MIN_DISTINCT_HOURS,
  READY_MASTERY_BY_TRACK, SECURE_MASTERY, TRACK_TIERS, TRACKS, label, setStep,
  type AnswerResult, type GivenTime, type RoundSummary, type Task, type Track,
} from './engine';
import { capitalize, formatSpokenCapitalized, numberWord } from './german';
import { confirmation, exampleMessage, helpText, withContext } from './hints';
import { clearProgress, loadProgress, saveProgress } from './storage';
import { BADGE_NAMES, TIER_NAMES, TRACK_NAMES, statsFromProgress, trackSecure } from './stats';
import { TIERS, formatDaytime, formatDigital, wrapHour, type ClockTime, type Tier } from './time';

const CORRECT_DELAY_MS = 1300;
const STAR_DELAY_MS = 900;

const SCENES: Record<DayContext, () => string> = {
  afternoon: afternoonScene,
  forenoon: forenoonScene,
  evening: eveningScene,
  noon: noonScene,
  night: nightScene,
};

const STAGE_MARKUP = `
  <main class="stage" data-ref="stage">
    <div class="clock-wrap" data-ref="clock"></div>
    <p class="message" data-ref="messageBox" aria-live="polite">
      <span class="daytime" data-ref="daytime" hidden><span data-ref="scene"></span></span>
      <span class="message-text"><span class="context-line" data-ref="sceneText"></span><span data-ref="message"></span></span>
    </p>
    <div class="answers" data-ref="answers"></div>
    <button class="next" type="button" data-ref="next" hidden>Weiter</button>
  </main>`;

interface RoundStats {
  starsAtStart: number;
  secured: string[];
}

function practicedName(track: Track, tier: Tier): string {
  switch (track) {
    case 'text':
      return `${TIER_NAMES[tier]} in Worten`;
    case 'daytime':
      return tier === 3 ? 'Viertelstunden zu jeder Tageszeit' : `${TIER_NAMES[tier]} am Nachmittag`;
    case 'set':
      return `Zeiger stellen: ${TIER_NAMES[tier]}`;
    case 'input':
      return `Uhrzeit eintippen: ${TIER_NAMES[tier]}`;
    case 'halb':
      return tier === 4 ? '„zehn vor halb“' : '„fünf vor halb“';
    case 'daySet':
      return `Zeiger stellen nach 24-Stunden-Zeit: ${TIER_NAMES[tier]}`;
    case 'dayInput':
      return `Eintippen mit Tageszeit: ${TIER_NAMES[tier]}`;
    default:
      return TIER_NAMES[tier];
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clockStats(): ModuleStats {
  return statsFromProgress(loadProgress(Date.now()), Date.now());
}

/** A starting position for setting the hands that differs clearly from the target. */
function startPosition(target: ClockTime, step: number): ClockTime {
  const minute = step >= 60 ? 0 : (Math.round(((target.minute + 30) % 60) / step) * step) % 60;
  return { hour: wrapHour(target.hour + 4), minute };
}

export function mountClockGame(root: HTMLElement, ctx: ModuleContext): () => void {
  const shell = new GameShell(root, {
    className: 'clock-game',
    stage: STAGE_MARKUP,
    exitLabel: ctx.exitLabel,
    onExit: ctx.exit,
    onHelp: showHelp,
    onSpeak: readAloud,
    onParents: showParents,
    // Time in a dialog is no answer time.
    onDialog: (open) => (open ? stopwatch.pause('dialog') : stopwatch.resume('dialog')),
  });
  const ref = <T extends HTMLElement = HTMLElement>(name: string): T => shell.ref<T>(name);
  const ui = {
    daytime: ref('daytime'),
    scene: ref('scene'),
    sceneText: ref('sceneText'),
    stage: ref('stage'),
    clock: ref('clock'),
    messageBox: ref('messageBox'),
    message: ref('message'),
    answers: ref('answers'),
    next: ref<HTMLButtonElement>('next'),
  };

  const { sound } = ctx;
  let engine = new Engine(loadProgress(Date.now()), Math.random, { sayFirst: ctx.settings.sayFirst });
  /** Tracks secure in every tier; a new one is named after the round. */
  const secureTracks = () => new Set(TRACKS.filter((t) => trackSecure(engine, t)));
  let completeTracks = secureTracks();
  const clock = new AnalogClock();
  ui.clock.appendChild(clock.svg);

  let task: Task;
  let phase: 'question' | 'feedback' = 'question';
  let helpUsed = false;
  /** An example's answer counts only after a moment: she listens before tapping. */
  let locked = false;
  /** Setting the hands at the 1-minute tier: one friendly "a little further" first. */
  let nudged = false;
  /** Active answer time for the (invisible) fluency bonus. */
  const stopwatch = new Stopwatch();
  const onVisibility = () => (document.hidden ? stopwatch.pause('hidden') : stopwatch.resume('hidden'));
  document.addEventListener('visibilitychange', onVisibility);
  let buttons: HTMLButtonElement[] = [];
  let keypad: Keypad | null = null;
  /** Typed digits, read like a digital clock: 3 digits = H:MM, 4 digits = HH:MM. */
  let typed = '';
  let pendingToast: string | null = null;
  let afterFeedback: (() => void) | null = null;
  let round = newRoundStats();

  function newRoundStats(): RoundStats {
    return { starsAtStart: engine.stars, secured: [] };
  }

  /** `shown` lets the bar stay full on a just completed round until the next task. */
  function renderScore(shown: { points: number; target: number } = engine.progress.round): void {
    shell.setScore(engine.stars, engine.progress.trophies);
    const { points, target } = shown;
    shell.setRound(points, target, 'Punkte', `${points} von ${target} Punkten bis zum Pokal`);
  }

  function answerLabel(option: Task['options'][number]): string {
    if (task.track === 'text') return formatSpokenCapitalized(option.time);
    if (task.track === 'halb') return formatSpokenCapitalized(option.time, { half: true });
    return label(task.track, option.time, option.hour24);
  }

  /** How the target time is given when setting the hands. */
  function targetText(): string {
    if (task.prompt === 'text') return `„${formatSpokenCapitalized(task.time)}“`;
    if (task.prompt === 'daytime' && task.context) return written24(task);
    return formatDigital(task.time);
  }

  /** "21:30 Uhr": the 24-hour time of a task with a time of day. */
  function written24(t: Task): string {
    return formatDaytime(t.time, hour24(t.context!, t.time.hour));
  }

  /**
   * Shows the time of day as picture and sentence in front of the question, so
   * it stays where the answer is chosen (setting from "21:30" only in examples,
   * on help and afterwards).
   */
  function showContext(): void {
    if (!task.context) return;
    ui.daytime.hidden = false;
    ui.scene.innerHTML = SCENES[task.context]();
    ui.sceneText.textContent = contextSentence(task.context, task.time);
  }

  // --- task flow -------------------------------------------------------------

  function nextTask(): void {
    shell.stopSpeaking();
    engine.sayFirst = ctx.settings.sayFirst;
    engine.touch(Date.now());
    task = engine.nextTask();
    saveProgress(engine.progress);
    renderScore();
    phase = 'question';
    helpUsed = false;
    nudged = false;
    stopwatch.restart(document.hidden ? ['hidden'] : []);
    afterFeedback = null;
    buttons = [];
    keypad = null;

    const example = task.kind === 'example';
    clock.disableSetting();
    clock.setTime(task.time);
    clock.setHelpers({ minuteLabels: task.minuteLabels, quarters: example && (task.tier === 2 || task.tier === 3) });
    clock.setFocus(example && task.mode === 'choice' ? (task.time.minute === 0 ? 'hour' : 'minute') : null, task.time);

    // The time-of-day context stays visible for the whole task.
    ui.daytime.hidden = true;
    ui.sceneText.textContent = '';
    if (task.track !== 'daySet' || example) showContext();
    ui.answers.className = `answers mode-${task.mode}`;
    ui.answers.classList.toggle('text-answers', task.track === 'text' || task.track === 'halb');
    ui.answers.classList.toggle('daytime-answers', task.track === 'daytime');
    ui.next.hidden = true;
    shell.holdAnswers();
    shell.setHelpEnabled(!example);

    if (task.mode === 'set') renderSet();
    else if (task.mode === 'input') renderInput();
    else if (task.sayFirst) renderSayFirst();
    else renderChoices();

    if (pendingToast) {
      shell.toast(pendingToast);
      pendingToast = null;
    }
  }

  function questionText(): string {
    let q: string;
    if (task.mode === 'set') q = `Stelle die Uhr auf ${targetText()}.`;
    else if (task.mode === 'input') q = 'Wie spät ist es? Tippe die Uhrzeit ein.';
    else q = task.track === 'text' || task.track === 'halb' ? 'Wie sagt man?' : 'Wie spät ist es?';
    return task.familiar ? `Das kannst du schon! ${q}` : q;
  }

  /**
   * An example is read aloud at once; its marked answer lights up once it has
   * been read. Hands and digits can be tried meanwhile, only "Fertig" waits.
   */
  function showQuestion(): void {
    if (task.kind !== 'example') {
      locked = false;
      setMessage(questionText(), 'question');
      return;
    }
    const shown = task;
    locked = true;
    setMessage(exampleMessage(task.explanation ?? '', task.mode), 'explain');
    shell.explain([messageSpeech()], {
      unlock: () => task === shown && (locked = false),
      reveal: () => task === shown && phase === 'question' && task.mode === 'choice' && buttons[task.correctIndex]?.classList.add('suggested'),
    });
  }

  function renderChoices(): void {
    buttons = task.options.map((option, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'answer';
      b.textContent = answerLabel(option);
      b.addEventListener('click', () => onChoice(i));
      return b;
    });
    ui.answers.replaceChildren(...buttons);
    showQuestion();
  }

  /** "Erst sagen, dann aufdecken": the answers stay hidden until she has said the time. */
  function renderSayFirst(): void {
    setMessage('Sag die Uhrzeit laut. Dann tippe auf „Aufdecken“.', 'question');
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'reveal';
    reveal.textContent = 'Aufdecken';
    reveal.addEventListener('click', () => {
      ui.answers.classList.remove('mode-reveal');
      renderChoices();
      shell.holdAnswers();
      setMessage('Hast du es richtig gesagt? Tippe auf deine Uhrzeit.', 'question');
    });
    ui.answers.classList.add('mode-reveal');
    ui.answers.replaceChildren(reveal);
  }

  function renderSet(): void {
    const step = setStep(task.tier);
    clock.enableSetting(startPosition(task.time, step), step);
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'check';
    done.textContent = 'Fertig';
    done.addEventListener('click', onSetDone);
    buttons = [done];
    ui.answers.replaceChildren(done);
    showQuestion();
  }

  function renderInput(): void {
    typed = '';
    const display = document.createElement('div');
    display.className = 'time-display';
    display.innerHTML = '<span class="time-field" data-field="hour"></span><span class="time-colon">:</span><span class="time-field" data-field="minute"></span>';
    keypad = createKeypad({
      onDigit: (d) => typeDigit(d),
      onBackspace: () => {
        typed = typed.slice(0, -1);
        updateDisplay();
      },
      onSubmit: onInputDone,
    });
    ui.answers.replaceChildren(display, keypad.element);
    updateDisplay();
    showQuestion();
  }

  /** Splits the typed digits into hour and minutes: "100" → 1:00, "1123" → 11:23. */
  function typedParts(): { hour: string; minute: string } {
    if (typed.length <= 2) return { hour: typed, minute: '' };
    return { hour: typed.slice(0, typed.length - 2), minute: typed.slice(-2) };
  }

  function typeDigit(d: number): void {
    if (phase !== 'question' || typed.length >= 4 || !shell.answersReady) return;
    typed += String(d);
    updateDisplay();
  }

  function updateDisplay(): void {
    const field = (name: 'hour' | 'minute') => ui.answers.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    const { hour, minute } = typedParts();
    field('hour').textContent = hour || '–';
    field('minute').textContent = minute.padEnd(2, '–');
    field('hour').classList.toggle('active', typed.length < 3);
    field('minute').classList.toggle('active', typed.length >= 3 && typed.length < 4);
    keypad?.setSubmitEnabled(typed.length >= 3);
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
    lockAnswers();
    const result = engine.answer(task, index, helpUsed, stopwatch.read());
    buttons[task.correctIndex]?.classList.add('correct');
    buttons.forEach((b, i) => {
      if (i !== task.correctIndex) b.classList.add(i === index ? 'wrong' : 'faded');
    });
    finish(result);
  }

  function onSetDone(): void {
    if (phase !== 'question' || locked || !shell.answersReady) return;
    const set = clock.setTimeValue();
    if (!set) return;
    // 1-minute tier: one strike off gets a friendly nudge instead of a mistake.
    const off = ((set.hour % 12) * 60 + set.minute) - ((task.time.hour % 12) * 60 + task.time.minute);
    if (task.tier === 6 && Math.abs(off) === 1 && !nudged && task.kind !== 'example') {
      nudged = true;
      helpUsed = true;
      setMessage(off < 0 ? 'Fast! Noch einen Strich weiter.' : 'Fast! Einen Strich zurück.', 'explain');
      return;
    }
    phase = 'feedback';
    lockAnswers();
    clock.disableSetting();
    const result = engine.answerTime(task, set, helpUsed, stopwatch.read());
    // Then show how it looks – unless she has already moved on to the next task.
    const shown = task;
    if (!result.ok) shell.later(() => task === shown && clock.setTime(shown.time), 900);
    finish(result);
  }

  function onInputDone(): void {
    if (phase !== 'question' || locked || typed.length < 3 || !shell.answersReady) return;
    const parts = typedParts();
    const given: GivenTime = { hour: Number(parts.hour), minute: Number(parts.minute) };
    if (given.hour > 23 || given.minute > 59) {
      // Not a time at all: a typing slip, not a reading mistake.
      setMessage(`${parts.hour}:${parts.minute} gibt es nicht. Bitte noch einmal.`, 'explain');
      typed = '';
      updateDisplay();
      return;
    }
    phase = 'feedback';
    keypad?.setDisabled(true);
    const result = engine.answerTime(task, given, helpUsed, stopwatch.read());
    finish(result, given);
  }

  /** Common feedback for all modes. */
  function finish(result: AnswerResult, typedTime?: GivenTime): void {
    saveProgress(engine.progress);
    if (result.points) ctx.addPoints(result.points);
    if (task.kind !== 'example') renderScore(result.roundComplete ?? undefined);
    if (result.unlocked.length) {
      pendingToast = `Neu: ${result.unlocked.map((u) => practicedName(u.track, u.tier)).join(', ')}!`;
    }
    round.secured.push(...result.secured.flatMap((s) => BADGE_NAMES[s.track][s.tier] ?? []));
    // A whole track secure is a skill of its own: its sweet on the tile is full now.
    // Compared with before the answer, as a tier can become ready and secure at once.
    for (const track of TRACKS) {
      if (!completeTracks.has(track) && trackSecure(engine, track)) {
        completeTracks.add(track);
        round.secured.push(`${TRACK_NAMES[track]}: alle Stufen sicher!`);
      }
    }

    if (result.ok) {
      const lead = task.kind === 'example' ? 'Genau!' : helpUsed ? 'Gemeinsam geschafft!' : 'Richtig!';
      showContext();
      // 23:23 for a clock without time of day is right too; show the usual way.
      const written =
        task.track === 'input' && typedTime && typedTime.hour !== task.time.hour ? ` Hier schreiben wir ${formatDigital(task.time)}.` : '';
      setMessage(`${lead} ${confirmation(task)}${written}`, 'good');
      if (result.streak) {
        const n = result.streak <= 12 ? capitalize(numberWord(result.streak)) : String(result.streak);
        shell.toast(`${n} hintereinander geschafft!`);
      }
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
    showContext();
    let shown = '';
    if (task.track === 'dayInput' && task.context) shown = ` Richtig ist ${written24(task)}.`;
    else if (task.mode === 'input') shown = ` Richtig ist ${formatDigital(task.time)}.`;
    setMessage(`Schauen wir zusammen. ${result.hint ?? ''}${shown}`, 'explain');
    clock.setFocus(result.hintFocus ?? null, task.time);
    if (result.hintFocus === 'minute') clock.setHelpers({ minuteLabels: true, quarters: false });
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

  function showTrophy(summary: RoundSummary): void {
    shell.stopSpeaking();
    sound.star();
    const stars = engine.stars - round.starsAtStart;
    const lines = [`<p class="round-score">${summary.points} Punkte · ${plural(summary.tasks, 'Uhrzeit', 'Uhrzeiten')} geübt</p>`];
    if (stars > 0) {
      const icons = `<span class="inline-stars">${plainStar('#fbbf24').repeat(Math.min(stars, 5))}</span>`;
      lines.push(`<p>Neu: ${icons} ${plural(stars, 'Stern', 'Sterne')}</p>`);
    }
    for (const badge of round.secured) lines.push(`<p class="badge">${badge}</p>`);
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

  // --- UI helpers --------------------------------------------------------------

  /** The message as read aloud when it differs from the shown one (help naming the target). */
  let spokenMessage: string | null = null;

  function setMessage(text: string, tone: 'question' | 'good' | 'explain', spoken: string | null = null): void {
    ui.message.textContent = text;
    ui.messageBox.className = `message ${tone}`;
    spokenMessage = spoken;
  }

  function lockAnswers(): void {
    for (const b of buttons) b.disabled = true;
    shell.stopSpeaking();
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
    clock.setHelpers({ minuteLabels: true, quarters: true });
    if (task.mode !== 'set') clock.setFocus('hour', task.time);
    if (task.track === 'daySet') showContext();
    const text = helpText({ ...task, hourOnly: setStep(task.tier) >= 60 }, targetText());
    setMessage(text.shown, 'explain', text.spoken);
    speakMessage();
  }

  /** The message as spoken, after the time of day when it is shown. */
  function messageSpeech(): string {
    return withContext(ui.daytime.hidden ? undefined : task.context, task.time, spokenMessage ?? ui.message.textContent ?? '');
  }

  function speakMessage(): void {
    // Listening is not answering time.
    stopwatch.pause('speech');
    shell.speak([messageSpeech()], (i) => {
      if (i === -1) stopwatch.resume('speech');
    });
  }

  function readAloud(): void {
    if (phase === 'question' && task.mode === 'choice' && buttons.length && task.kind !== 'example') {
      const parts = [messageSpeech(), ...buttons.map((b) => b.textContent ?? '')];
      // Listening is not answering time.
      stopwatch.pause('speech');
      shell.speak(parts, (i) => {
        buttons.forEach((b, j) => b.classList.toggle('speaking', j === i - 1));
        if (i === -1) stopwatch.resume('speech');
      });
    } else {
      speakMessage();
    }
  }

  function showParents(): void {
    const rows = TRACKS.map((track) => {
      const cells = TIERS.map((tier) => {
        if (!TRACK_TIERS[track].includes(tier)) return '<td class="locked"></td>';
        const s = engine.tierState(track, tier);
        const status = s.secure ? 'sicher' : s.ready ? 'gelernt' : s.unlocked ? `übt ${s.mastery}` : '–';
        return `<td class="${s.unlocked ? '' : 'locked'}">${status}</td>`;
      }).join('');
      return `<tr><th>${TRACK_NAMES[track]}</th>${cells}</tr>`;
    }).join('');
    const header = TIERS.map((t) => `<th title="${TIER_NAMES[t]}">S${t}</th>`).join('');
    shell.showDialog(
      `<h2>Elternbereich</h2>
       <table class="progress-table"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>
       <p class="legend">S1 volle · S2 halbe · S3 Viertel · S4 10er · S5 5er · S6 einzelne Minuten.<br>
       „übt 40“ = Lernpunkte der Stufe: +${MASTERY_CORRECT} je richtige Antwort (+${MASTERY_FAST_BONUS} wenn flott),
       −${MASTERY_WRONG} je Fehler. „gelernt“ = nächste Stufe frei: Zahl ab ${READY_MASTERY_BY_TRACK.digital},
       alle anderen Spuren ab ${READY_MASTERY_BY_TRACK.text} Lernpunkten, mit richtigen Antworten auf
       mindestens ${MIN_DISTINCT_HOURS} verschiedene Stunden und alle Minutenwerte der Stufe.
       „sicher“ ab ${SECURE_MASTERY}. Ein Stern je ${CORRECT_PER_STAR} richtige Antworten.</p>
       <label class="setting"><input type="checkbox" data-ref="soundToggle" ${ctx.settings.sound ? 'checked' : ''}/> Töne</label>
       <label class="setting"><input type="checkbox" data-ref="sayFirstToggle" ${ctx.settings.sayFirst ? 'checked' : ''}/> Ab und zu: erst laut sagen, dann aufdecken</label>
       <p><button type="button" class="btn danger" data-ref="reset">Fortschritt löschen (3 Sek. halten)</button></p>`,
      [{ label: 'Schließen', primary: true, action: () => {} }],
    );
    ref<HTMLInputElement>('soundToggle').addEventListener('change', (e) => {
      ctx.settings.sound = (e.target as HTMLInputElement).checked;
      sound.enabled = ctx.settings.sound;
      ctx.saveSettings();
    });
    ref<HTMLInputElement>('sayFirstToggle').addEventListener('change', (e) => {
      ctx.settings.sayFirst = (e.target as HTMLInputElement).checked;
      ctx.saveSettings();
    });
    shell.holdToConfirm(ref<HTMLButtonElement>('reset'), 3000, () => {
      clearProgress();
      shell.cancelPending();
      engine = new Engine(loadProgress(Date.now()), Math.random, { sayFirst: ctx.settings.sayFirst });
      completeTracks = secureTracks();
      round = newRoundStats();
      shell.closeDialog(nextTask);
    });
  }

  renderScore();
  nextTask();

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    shell.dispose();
  };
}
