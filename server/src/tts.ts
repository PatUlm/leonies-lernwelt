import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORDS } from '../../src/modules/english/words.ts';

/** Piper voice per language. Part of the cache key: a new voice renders anew. */
const VOICES: Record<string, string> = { en: 'en_GB-southern_english_female-low' };
/** Piper length scales for the app's speech rates 0.9 and 0.6 (slow). */
const LENGTH_SCALE = { normal: 1.1, slow: 1.67 };
/**
 * Only the app's own words are spoken: the endpoint cannot be used to render
 * arbitrary text, and the cache stays bounded.
 */
const ALLOWED: Record<string, ReadonlySet<string>> = { en: new Set(WORDS.map((w) => w.en)) };
const RENDER_TIMEOUT_MS = 8000;

export function speakable(lang: string, text: string): boolean {
  return ALLOWED[lang]?.has(text) ?? false;
}

/**
 * Recordings from the Piper service (tts/), kept as MP3 files named by a hash
 * of voice, speed and text. Each one is rendered once and then read from disk.
 */
export class SpeechCache {
  private readonly dir: string;
  private readonly renderUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly rendering = new Map<string, Promise<Buffer>>();

  constructor(dir: string, renderUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)) {
    this.dir = dir;
    this.renderUrl = renderUrl;
    this.fetchFn = fetchFn;
  }

  /** The recording of a speakable text; throws if it cannot be rendered. */
  async get(lang: string, text: string, slow: boolean): Promise<Buffer> {
    if (!speakable(lang, text)) throw new Error(`not speakable: ${lang} ${text}`);
    const voice = VOICES[lang];
    const lengthScale = slow ? LENGTH_SCALE.slow : LENGTH_SCALE.normal;
    const key = createHash('sha256').update(JSON.stringify([voice, lengthScale, text])).digest('hex');
    const file = join(this.dir, `${key}.mp3`);
    try {
      return await readFile(file);
    } catch {
      // Not rendered yet; parallel requests for the same text share one rendering.
      let pending = this.rendering.get(key);
      if (!pending) {
        pending = this.render(file, voice, text, lengthScale).finally(() => this.rendering.delete(key));
        this.rendering.set(key, pending);
      }
      return pending;
    }
  }

  private async render(file: string, voice: string, text: string, lengthScale: number): Promise<Buffer> {
    const res = await this.fetchFn(`${this.renderUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice, text, lengthScale }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    if (!res.ok || res.headers.get('content-type') !== 'audio/mpeg') throw new Error(`tts service answered ${res.status}`);
    const audio = Buffer.from(await res.arrayBuffer());
    await mkdir(this.dir, { recursive: true });
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, audio);
    await rename(tmp, file);
    return audio;
  }
}
