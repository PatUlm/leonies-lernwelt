import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { ProfileStore } from '../../server/src/store.ts';
import { SpeechCache, speakable } from '../../server/src/tts.ts';

let dir: string;
let requests: { voice: string; text: string; lengthScale: number }[];
let answer: () => Response;

/** Stands in for the Piper service: answers "mp3:<text>:<lengthScale>". */
const fakeFetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  requests.push(body);
  await new Promise((resolve) => setTimeout(resolve, 5));
  return answer() ?? new Response(`mp3:${body.text}:${body.lengthScale}`, { headers: { 'Content-Type': 'audio/mpeg' } });
}) as unknown as typeof fetch;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lernwelt-tts-'));
  requests = [];
  answer = () => undefined as unknown as Response;
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('speech cache', () => {
  it('speaks only the English words of the app', () => {
    expect(speakable('en', 'red')).toBe(true);
    expect(speakable('en', 'seventeen')).toBe(true);
    expect(speakable('en', 'Red')).toBe(false);
    expect(speakable('en', 'hello world')).toBe(false);
    expect(speakable('de', 'rot')).toBe(false);
  });

  it('renders a word once and then reads it from disk', async () => {
    const cache = new SpeechCache(join(dir, 'tts'), 'http://tts', fakeFetch);
    expect((await cache.get('en', 'red', false)).toString()).toBe('mp3:red:1.1');
    expect((await new SpeechCache(join(dir, 'tts'), 'http://tts', fakeFetch).get('en', 'red', false)).toString()).toBe('mp3:red:1.1');
    expect(requests).toEqual([{ voice: 'en_GB-southern_english_female-low', text: 'red', lengthScale: 1.1 }]);
    expect(await readdir(join(dir, 'tts'))).toHaveLength(1);
  });

  it('keeps the slow recording apart and renders parallel requests once', async () => {
    const cache = new SpeechCache(dir, 'http://tts', fakeFetch);
    const [a, b, slow] = await Promise.all([cache.get('en', 'cat', false), cache.get('en', 'cat', false), cache.get('en', 'cat', true)]);
    expect(a.toString()).toBe('mp3:cat:1.1');
    expect(b.toString()).toBe('mp3:cat:1.1');
    expect(slow.toString()).toBe('mp3:cat:1.67');
    expect(requests).toHaveLength(2);
  });

  it('stores nothing when the service fails', async () => {
    answer = () => new Response('{"error":"x"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
    const cache = new SpeechCache(dir, 'http://tts', fakeFetch);
    await expect(cache.get('en', 'dog', false)).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses text that is not a word of the app', async () => {
    await expect(new SpeechCache(dir, 'http://tts', fakeFetch).get('en', 'hello', false)).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

describe('GET /api/tts', () => {
  let server: Server;
  let base: string;

  async function start(speech?: SpeechCache): Promise<void> {
    const store = new ProfileStore(join(dir, 'profiles'));
    await store.init();
    server = createServer(createApp({ store, speech }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  it('answers the recording as MP3 without sign-in', async () => {
    await start(new SpeechCache(join(dir, 'tts'), 'http://tts', fakeFetch));
    const res = await fetch(`${base}/api/tts?lang=en&text=red&slow=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('mp3:red:1.67');
  });

  it('answers byte ranges', async () => {
    await start(new SpeechCache(join(dir, 'tts'), 'http://tts', fakeFetch));
    const part = await fetch(`${base}/api/tts?lang=en&text=red`, { headers: { Range: 'bytes=0-3' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-3/11');
    expect(await part.text()).toBe('mp3:');
    const tail = await fetch(`${base}/api/tts?lang=en&text=red`, { headers: { Range: 'bytes=-3' } });
    expect(await tail.text()).toBe('1.1');
    const outside = await fetch(`${base}/api/tts?lang=en&text=red`, { headers: { Range: 'bytes=20-' } });
    expect(outside.status).toBe(416);
  });

  it('rejects other text and reports a missing service', async () => {
    await start();
    expect((await fetch(`${base}/api/tts?lang=en&text=hello`)).status).toBe(400);
    expect((await fetch(`${base}/api/tts?lang=en&text=red`)).status).toBe(503);
  });

  it('reports a failing service as unavailable', async () => {
    answer = () => new Response('', { status: 500 });
    await start(new SpeechCache(join(dir, 'tts'), 'http://tts', fakeFetch));
    expect((await fetch(`${base}/api/tts?lang=en&text=red`)).status).toBe(503);
  });
});
