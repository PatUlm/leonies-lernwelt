import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORDS } from '../../src/modules/english/words.ts';

/**
 * Only the app's own words have recordings: the word also names the file, so
 * the list keeps requests inside the recordings directory.
 */
const ALLOWED: Record<string, ReadonlySet<string>> = { en: new Set(WORDS.map((w) => w.en)) };

export function speakable(lang: string, text: string): boolean {
  return ALLOWED[lang]?.has(text) ?? false;
}

/**
 * Recorded words, rendered and checked beforehand (scripts/render-speech.ts)
 * and uploaded with bin/tts-upload.sh: <dir>/<lang>/<word>.mp3 and <word>.slow.mp3.
 */
export class Recordings {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** The recording of a speakable word, or null if there is none. */
  async get(lang: string, text: string, slow: boolean): Promise<Buffer | null> {
    if (!speakable(lang, text)) return null;
    try {
      return await readFile(join(this.dir, lang, slow ? `${text}.slow.mp3` : `${text}.mp3`));
    } catch {
      return null;
    }
  }
}
