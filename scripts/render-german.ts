/**
 * Renders the German sentences of scripts/german-texts.ts with Gemini TTS into
 * .data/tts/de/ (<hash>.mp3 and manifest.json) plus a page to listen to them
 * before bin/tts-upload.sh de puts them on the server.
 *
 *   node scripts/render-german.ts                # renders what is missing
 *   node scripts/render-german.ts --again 12 57  # renders these numbers of the page again
 *   node scripts/render-german.ts --dry-run      # only counts
 *
 * One sentence per request: several in one request had to be cut apart at
 * the pauses, which went wrong too often. The speech service allows about 100
 * requests a day, so a run stops at the daily limit (or MAX_REQUESTS) and the
 * next day's run goes on.
 * The API key is read from ~/.config/lernwelt/gemini-api-key (or GEMINI_API_KEY).
 * Needs ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The app's modules import without the .ts extension, as Vite resolves them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context);
      throw err;
    }
  },
});
const { germanTexts } = await import('./german-texts.ts');

const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
const VOICE = 'en-us-varo';
const STYLE = 'Lies den Text auf Deutsch vor, freundlich, ruhig und deutlich, wie ein geduldiger Lehrer für ein achtjähriges Kind.';
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS ?? 100);
/** Pause between requests: the API allows about 10 per minute. */
const PAUSE_MS = 6500;
const OUT = join(import.meta.dirname, '..', '.data', 'tts', 'de');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const again = new Set(args.filter((a) => /^\d+$/.test(a)).map(Number));

const texts = germanTexts();
const fileOf = (text: string) => `${createHash('sha256').update(`${VOICE}\n${text}`).digest('hex').slice(0, 16)}.mp3`;
mkdirSync(OUT, { recursive: true });

for (const n of again) if (!texts[n - 1]) throw new Error(`no text number ${n}`);
const missing = texts.filter((t, i) => again.has(i + 1) || !existsSync(join(OUT, fileOf(t.text))));
console.log(`${texts.length} sentences, ${missing.length} to render (at most ${MAX_REQUESTS} now)`);
if (dryRun) process.exit(0);

const key = process.env.GEMINI_API_KEY ?? readFileSync(join(homedir(), '.config', 'lernwelt', 'gemini-api-key'), 'utf8').trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class DailyLimit extends Error {}

async function render(text: string): Promise<Buffer> {
  const body = {
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
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
      if (!audio) throw new Error(`no audio for "${text}"`);
      return Buffer.from(audio, 'base64');
    }
    const message = (await res.text()).slice(0, 300);
    // A daily quota does not come back within minutes: stop and go on tomorrow.
    if (res.status === 429 && /per.?day|daily/i.test(message)) throw new DailyLimit(message);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      console.log(`  ${res.status}, retrying in 30 s`);
      await sleep(30_000);
      continue;
    }
    if (res.status === 429) throw new DailyLimit(message);
    throw new Error(`${res.status}: ${message}`);
  }
}

/** MP3 without the silence before and after the sentence (50 ms kept). */
function toMp3(wav: Buffer, file: string): void {
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05';
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', 'pipe:0', '-af', `${trim},areverse,${trim},areverse`,
    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', file], { input: wav });
}

let requests = 0;
try {
  for (const t of missing) {
    if (requests >= MAX_REQUESTS) {
      console.log(`stopped after ${requests} requests (MAX_REQUESTS)`);
      break;
    }
    requests += 1;
    toMp3(await render(t.text), join(OUT, fileOf(t.text)));
    console.log(`${requests}/${missing.length}: ${t.text.slice(0, 60)}`);
    await sleep(PAUSE_MS);
  }
} catch (err) {
  if (!(err instanceof DailyLimit)) throw err;
  console.log(`daily limit reached after ${requests} requests – run again tomorrow\n  ${err.message}`);
}

// Manifest of the current sentences only; recordings of old sentences go.
const manifest: Record<string, string> = {};
for (const t of texts) if (existsSync(join(OUT, fileOf(t.text)))) manifest[t.text] = fileOf(t.text);
const keep = new Set(Object.values(manifest));
for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) rmSync(join(OUT, f));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ voice: VOICE, texts: manifest }, null, 1));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = texts.map((t, i) => {
  const audio = manifest[t.text] ? `<audio controls preload="none" src="${fileOf(t.text)}"></audio>` : 'fehlt';
  return `<tr><td>${i + 1}</td><td>${esc(t.source)}</td><td>${esc(t.text)}</td><td>${audio}</td></tr>`;
});
writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Deutsche Aufnahmen prüfen</title>
<style>body{font:15px system-ui;margin:2em}td{padding:.25em .6em;vertical-align:middle}tr:nth-child(even){background:#f4f4f4}</style>
<h1>Deutsche Sätze (${VOICE})</h1><p>${Object.keys(manifest).length} von ${texts.length} aufgenommen. Falsche Nummern neu: <code>node scripts/render-german.ts --again 12 57</code></p>
<table>${rows.join('\n')}</table>`);
console.log(`done: ${Object.keys(manifest).length}/${texts.length} recorded, ${join(OUT, 'index.html')}`);
