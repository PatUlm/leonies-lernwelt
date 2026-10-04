/** Read-aloud via the browser's speech synthesis (German voice if available). */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function germanVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'de-DE') ?? voices.find((v) => v.lang.startsWith('de'));
}

/**
 * Speaks the parts one after another; `onPart` reports the index being spoken
 * (or -1 when done) so the UI can highlight it.
 */
export function speak(parts: string[], onPart: (index: number) => void = () => {}): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = germanVoice();
  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (voice) u.voice = voice;
    u.rate = 0.9;
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
