import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { WORDS } from '../../src/modules/english/words.ts';
import { englishTexts, sentenceFile } from '../../src/modules/howmany/content.ts';

/** The words of "Farben, Zahlen, Tiere", recorded at normal and slow speed. */
const WORD_SET: ReadonlySet<string> = new Set(WORDS.map((w) => w.en));
/** The words and sentences of "How many?", recorded like the words (normal speed only; cat and dog are words too). */
const TEXTS: ReadonlySet<string> = new Set(englishTexts().filter((t) => !WORD_SET.has(t)));

/**
 * Only the app's own words and sentences have recordings: they also name the
 * file, so the list keeps requests inside the recordings directory.
 */
const ALLOWED: Record<string, ReadonlySet<string>> = { en: new Set([...WORD_SET, ...TEXTS]) };

export function speakable(lang: string, text: string): boolean {
  return ALLOWED[lang]?.has(text) ?? false;
}

/** German sentences are looked up by their text; anything longer is no sentence of the app. */
export const MAX_TEXT_LENGTH = 1000;
/** File names in the German manifest, written by scripts/render-german.ts. */
const FILE_PATTERN = /^[0-9a-f]{16}\.mp3$/;

interface Manifest {
  mtimeMs: number;
  files: ReadonlyMap<string, string>;
}

/**
 * Recordings, rendered and checked beforehand and uploaded with
 * bin/tts-upload.sh. English words (scripts/render-speech.ts):
 * <dir>/en/<word>.mp3 and <word>.slow.mp3, English sentences
 * <dir>/en/<sentence-file>.mp3 (see sentenceFile). German sentences
 * (scripts/render-german.ts): <dir>/de/manifest.json maps the spoken text
 * (see src/shared/spoken.ts) to its file.
 */
export class Recordings {
  private readonly dir: string;
  private manifest: Manifest | null = null;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** The recording of a word or sentence, or null if there is none. */
  async get(lang: string, text: string, slow: boolean): Promise<Buffer | null> {
    let file: string | undefined;
    if (lang === 'de') file = (await this.german()).get(text);
    else if (lang === 'en' && TEXTS.has(text)) file = `${sentenceFile(text)}.mp3`;
    else if (speakable(lang, text)) file = slow ? `${text}.slow.mp3` : `${text}.mp3`;
    if (!file) return null;
    try {
      return await readFile(join(this.dir, lang, file));
    } catch {
      return null;
    }
  }

  /** The German sentences with a recording, so the app asks only for those. */
  async germanTexts(): Promise<string[]> {
    return [...(await this.german()).keys()];
  }

  /** The manifest, read again once an upload has replaced it. */
  private async german(): Promise<ReadonlyMap<string, string>> {
    const path = join(this.dir, 'de', 'manifest.json');
    try {
      const { mtimeMs } = await stat(path);
      if (this.manifest?.mtimeMs !== mtimeMs) {
        const { texts } = JSON.parse(await readFile(path, 'utf8')) as { texts: Record<string, string> };
        const files = new Map(Object.entries(texts).filter(([, file]) => FILE_PATTERN.test(file)));
        this.manifest = { mtimeMs, files };
      }
      return this.manifest.files;
    } catch {
      this.manifest = null;
      return new Map();
    }
  }
}
