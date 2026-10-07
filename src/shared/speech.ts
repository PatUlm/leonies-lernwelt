import { spokenGerman } from './spoken';

/**
 * Read-aloud via the browser's speech synthesis (German voice if available,
 * English for English words); English words and the recorded German sentences
 * play a server recording first.
 */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** A part to speak: German text, or an English word or phrase (`slow` for a second, careful listen). */
export type SpeechPart = string | { en: string; slow?: boolean };

/** Android reports "en_GB", others "en-GB". */
function langOf(v: SpeechSynthesisVoice): string {
  return v.lang.replace('_', '-');
}

function germanVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => langOf(v) === 'de-DE') ?? voices.find((v) => langOf(v).startsWith('de'));
}

/** British English as in the school book, any other English voice otherwise. */
export function englishVoice(): SpeechSynthesisVoice | undefined {
  if (!canSpeak()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => langOf(v) === 'en-GB') ?? voices.find((v) => langOf(v).startsWith('en'));
}

/**
 * Resolves once the voice list is known: some browsers load it only after a
 * while and announce it with "voiceschanged"; without that it waits `maxMs`.
 */
export function voicesReady(maxMs = 1500): Promise<void> {
  if (!canSpeak() || window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    const timer = window.setTimeout(done, maxMs);
    window.speechSynthesis.addEventListener('voiceschanged', done);
  });
}

/** Waiting longer for a recording than this, the device voice speaks instead. */
const RECORDING_TIMEOUT_MS = 4000;

/** English words recorded on the server; the device voice is the fallback. */
function recordingUrl(part: { en: string; slow?: boolean }): string {
  return `./api/tts?lang=en&word=${encodeURIComponent(part.en)}${part.slow ? '&slow=1' : ''}`;
}

function germanUrl(text: string): string {
  return `./api/tts?lang=de&text=${encodeURIComponent(text)}`;
}

/** Waiting longer for the list of German recordings than this, the device voice speaks. */
const TEXTS_TIMEOUT_MS = 1500;
/** The German sentences recorded on the server (spoken form); empty until loaded. */
let germanTexts: ReadonlySet<string> = new Set();
let loadingTexts: Promise<void> | null = null;
let textsLoaded = false;

/**
 * Loads the list of recorded German sentences once, so only those are asked
 * for. Called early (app start): a speech starting while it loads waits a moment.
 */
export function prepareSpeech(): void {
  if (loadingTexts || typeof fetch === 'undefined') return;
  const loading = fetch('./api/tts/texts?lang=de')
    .then((res) => (res.ok ? res.json() : { texts: [] }))
    .then((body: { texts?: unknown }) => {
      if (Array.isArray(body.texts)) germanTexts = new Set(body.texts.filter((t): t is string => typeof t === 'string'));
    })
    .catch(() => {})
    .finally(() => {
      if (loadingTexts === loading) textsLoaded = true;
    });
  loadingTexts = loading;
}

/** Runs `fn` once the list of recordings is known, or after a short wait. */
function whenTextsKnown(fn: () => void): void {
  if (!loadingTexts || textsLoaded) {
    fn();
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    fn();
  };
  window.setTimeout(once, TEXTS_TIMEOUT_MS);
  void loadingTexts.then(once);
}

/** One element for all recordings: mobile browsers allow sound on it after the first tap. */
let player: HTMLAudioElement | null = null;
/** The speech in progress; stopSpeaking() ends it and reports -1 to its caller. */
let current: { onPart: (index: number) => void } | null = null;
/** Stops the recording in progress without reporting back. */
let dropRecording: (() => void) | null = null;

/**
 * Plays a recording. `fail` runs instead of `done` when it cannot be played
 * (offline, no server voice, blocked sound, too slow to load).
 */
function playRecording(url: string, started: () => void, done: () => void, fail: () => void): void {
  dropRecording?.();
  player ??= new Audio();
  const audio = player;
  let playing = false;
  let settled = false;
  const release = () => {
    settled = true;
    window.clearTimeout(timer);
    audio.onplaying = audio.onended = audio.onerror = null;
    dropRecording = null;
  };
  const finish = (next: () => void, stop = false) => {
    if (settled) return;
    release();
    if (stop) audio.pause();
    next();
  };
  const timer = window.setTimeout(() => finish(fail, true), RECORDING_TIMEOUT_MS);
  dropRecording = () => finish(() => {}, true);
  audio.onplaying = () => {
    window.clearTimeout(timer);
    if (!playing) started();
    playing = true;
  };
  audio.onended = () => finish(done);
  audio.onerror = () => finish(fail);
  audio.src = url;
  audio.play().catch(() => finish(fail, true));
}

/**
 * Speaks the parts one after another; `onPart` reports the index being spoken
 * (or -1 when done) so the UI can highlight it. German parts in a row go to
 * the device voice together; an English word plays its recording and falls
 * back to the device voice.
 */
export function speak(parts: SpeechPart[], onPart: (index: number) => void = () => {}): void {
  if (!canSpeak()) return;
  // The new speech replaces the old one without reporting its end: a caller
  // that paused for the old speech stays paused for the new one.
  halt();
  const run = { onPart };
  current = run;
  const synth = window.speechSynthesis;
  const german = germanVoice();
  const english = englishVoice();
  const active = () => current === run;
  const utterance = (i: number): SpeechSynthesisUtterance => {
    const part = parts[i];
    const en = typeof part !== 'string';
    const u = new SpeechSynthesisUtterance(en ? part.en : spokenGerman(part));
    u.lang = en ? (english ? langOf(english) : 'en-GB') : 'de-DE';
    const voice = en ? english : german;
    if (voice) u.voice = voice;
    u.rate = en && part.slow ? 0.6 : 0.9;
    u.onstart = () => active() && onPart(i);
    return u;
  };
  /** Speaks parts i..end-1 with the device voice, then continues at `end`. */
  const viaDevice = (i: number, end: number) => {
    for (let j = i; j < end; j++) {
      const u = utterance(j);
      if (j === end - 1) u.onend = u.onerror = () => next(end);
      synth.speak(u);
    }
  };
  const next = (i: number): void => {
    if (!active()) return;
    if (i === parts.length) {
      current = null;
      onPart(-1);
      return;
    }
    const part = parts[i];
    const recorded = (p: SpeechPart) => typeof p === 'string' && germanTexts.has(spokenGerman(p));
    if (typeof part === 'string' && !recorded(part)) {
      let end = i + 1;
      while (end < parts.length && typeof parts[end] === 'string' && !recorded(parts[end])) end++;
      viaDevice(i, end);
      return;
    }
    const url = typeof part === 'string' ? germanUrl(spokenGerman(part)) : recordingUrl(part);
    playRecording(url, () => active() && onPart(i), () => next(i + 1), () => active() && viaDevice(i, i + 1));
  };
  whenTextsKnown(() => next(0));
}

/** Ends the speech in progress and returns it. */
function halt(): { onPart: (index: number) => void } | null {
  const run = current;
  current = null;
  dropRecording?.();
  if (canSpeak()) window.speechSynthesis.cancel();
  return run;
}

export function stopSpeaking(): void {
  halt()?.onPart(-1);
}
