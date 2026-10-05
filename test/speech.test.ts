import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeUtterance {
  text: string;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

let queue: FakeUtterance[];
let audio: FakeAudio | null;
let playResult: () => Promise<void>;

class FakeAudio {
  src = '';
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor() {
    audio = this;
  }
  play(): Promise<void> {
    this.paused = false;
    return playResult();
  }
  pause(): void {
    this.paused = true;
  }
}

/** The device voice ends the first queued part; the next starts by itself. */
function endUtterance(): void {
  const u = queue.shift()!;
  u.onend?.();
  queue[0]?.onstart?.();
}

async function load() {
  vi.resetModules();
  return import('../src/shared/speech.ts');
}

beforeEach(() => {
  queue = [];
  audio = null;
  playResult = () => Promise.resolve();
  const synth = {
    speak(u: FakeUtterance) {
      queue.push(u);
      if (queue.length === 1) u.onstart?.();
    },
    cancel() {
      queue = [];
    },
    getVoices: () => [{ lang: 'de-DE' }, { lang: 'en-GB' }],
  };
  vi.stubGlobal('window', { speechSynthesis: synth, setTimeout, clearTimeout });
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    lang = '';
    voice: unknown = null;
    rate = 1;
    onstart = null;
    onend = null;
    onerror = null;
    constructor(public text: string) {}
  });
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('speak', () => {
  it('plays English words from the server and German parts with the device voice', async () => {
    const { speak } = await load();
    const parts: number[] = [];
    speak(['Neues Wort: ', { en: 'red' }, ' heißt rot.'], (i) => parts.push(i));
    expect(queue.map((u) => u.text)).toEqual(['Neues Wort: ']);
    endUtterance();
    expect(audio!.src).toBe('./api/tts?lang=en&word=red');
    audio!.onplaying!();
    audio!.onended!();
    expect(queue.map((u) => u.text)).toEqual([' heißt rot.']);
    endUtterance();
    expect(parts).toEqual([0, 1, 2, -1]);
  });

  it('asks for the slow recording', async () => {
    const { speak } = await load();
    speak([{ en: 'seventeen', slow: true }]);
    expect(audio!.src).toBe('./api/tts?lang=en&word=seventeen&slow=1');
  });

  it('lets the device voice speak the word when the recording fails', async () => {
    const { speak } = await load();
    const parts: number[] = [];
    speak([{ en: 'red' }], (i) => parts.push(i));
    audio!.onerror!();
    expect(queue.map((u) => [u.text, u.lang])).toEqual([['red', 'en-GB']]);
    endUtterance();
    expect(parts).toEqual([0, -1]);
  });

  it('lets the device voice speak the word when sound is blocked', async () => {
    playResult = () => Promise.reject(new Error('NotAllowedError'));
    const { speak } = await load();
    speak([{ en: 'red' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.map((u) => u.text)).toEqual(['red']);
    expect(audio!.paused).toBe(true);
  });

  it('replaces running speech without reporting its end; stopping reports it', async () => {
    const { speak, stopSpeaking } = await load();
    const first: number[] = [];
    const second: number[] = [];
    speak(['Wie spät ist es?', 'drei Uhr'], (i) => first.push(i));
    speak(['Wie spät ist es?', 'drei Uhr'], (i) => second.push(i));
    expect(first).toEqual([0]);
    stopSpeaking();
    expect(first).toEqual([0]);
    expect(second).toEqual([0, -1]);
  });

  it('ignores a replaced recording', async () => {
    const { speak } = await load();
    const first: number[] = [];
    speak([{ en: 'red' }], (i) => first.push(i));
    const old = { ...audio! };
    speak(['Hallo']);
    old.onplaying?.();
    old.onended?.();
    expect(first).toEqual([]);
    expect(audio!.paused).toBe(true);
  });
});
