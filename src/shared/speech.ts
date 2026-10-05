/** Read-aloud via the browser's speech synthesis (German voice if available, English for English words). */
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

/**
 * Speaks the parts one after another; `onPart` reports the index being spoken
 * (or -1 when done) so the UI can highlight it.
 */
export function speak(parts: SpeechPart[], onPart: (index: number) => void = () => {}): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const german = germanVoice();
  const english = englishVoice();
  parts.forEach((part, i) => {
    const en = typeof part !== 'string';
    const u = new SpeechSynthesisUtterance(en ? part.en : part);
    u.lang = en ? (english ? langOf(english) : 'en-GB') : 'de-DE';
    const voice = en ? english : german;
    if (voice) u.voice = voice;
    u.rate = en && part.slow ? 0.6 : 0.9;
    u.onstart = () => onPart(i);
    if (i === parts.length - 1) {
      u.onend = () => onPart(-1);
      u.onerror = () => onPart(-1);
    }
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
