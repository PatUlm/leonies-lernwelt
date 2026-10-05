/**
 * Renders the English words of "Farben, Zahlen, Tiere" with Gemini TTS into
 * .data/tts/en/ (<word>.mp3 and <word>.slow.mp3) plus a page to listen to
 * them before bin/tts-upload.sh puts them on the server.
 *
 *   node scripts/render-speech.ts            # renders what is missing
 *   node scripts/render-speech.ts red blue   # renders these words again
 *   TTS_MODEL=gemini-3.8-flash-lite-tts node scripts/render-speech.ts   # another model
 *     (the daily request limit counts per model)
 *
 * The API key is read from ~/.config/lernwelt/gemini-api-key (or GEMINI_API_KEY).
 * Needs ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WORDS } from '../src/modules/english/words.ts';

const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
const VOICE = 'en-gb-tutor-13';
const STYLE = {
  normal: "Say this English word clearly and naturally, in a friendly British English teacher's voice, for an eight-year-old child learning English.",
  slow: 'Say this English word slowly and very clearly, like a friendly British English teacher repeating it for an eight-year-old child.',
};
/** Pause between requests: the API allows about 10 per minute. */
const PAUSE_MS = 6500;
const OUT = join(import.meta.dirname, '..', '.data', 'tts', 'en');

const key = process.env.GEMINI_API_KEY ?? readFileSync(join(homedir(), '.config', 'lernwelt', 'gemini-api-key'), 'utf8').trim();
const again = new Set(process.argv.slice(2));
const unknown = [...again].filter((w) => !WORDS.some((x) => x.en === w));
if (unknown.length) throw new Error(`not a word of the app: ${unknown.join(', ')}`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function render(word: string, speed: keyof typeof STYLE): Promise<Buffer> {
  const body = {
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text: word, annotations: [{ type: 'speech_metadata', style: STYLE[speed] }] }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice: VOICE }] },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as { steps?: { content?: { type: string; data?: string }[] }[] };
      const audio = data.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === 'audio')?.data;
      if (!audio) throw new Error(`no audio for ${word}`);
      return Buffer.from(audio, 'base64');
    }
    const text = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      console.log(`  ${res.status}, retrying in 30 s`);
      await sleep(30_000);
      continue;
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

/** MP3 without the silence before and after the word (50 ms kept). */
function toMp3(wav: Buffer, file: string): void {
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', 'pipe:0', '-af', `${trim},areverse,${trim},areverse`,
    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', file], { input: wav });
}

mkdirSync(OUT, { recursive: true });
for (const { en } of WORDS) {
  for (const speed of ['normal', 'slow'] as const) {
    const file = join(OUT, speed === 'slow' ? `${en}.slow.mp3` : `${en}.mp3`);
    if (existsSync(file) && !again.has(en)) continue;
    rmSync(file, { force: true });
    toMp3(await render(en, speed), file);
    console.log(`${en} (${speed})`);
    await sleep(PAUSE_MS);
  }
}

const rows = WORDS.map(({ en, de }) => `<tr><td>${en}</td><td>${de}</td>`
  + `<td><audio controls preload="none" src="${en}.mp3"></audio></td>`
  + `<td><audio controls preload="none" src="${en}.slow.mp3"></audio></td></tr>`);
writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Aufnahmen prüfen</title>
<style>body{font:16px system-ui;margin:2em}td{padding:.2em .8em}</style>
<h1>Englische Wörter (${VOICE})</h1><table><tr><th>Wort</th><th></th><th>normal</th><th>langsam</th></tr>${rows.join('\n')}</table>`);
console.log(`done: ${join(OUT, 'index.html')}`);
