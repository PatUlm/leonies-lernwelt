import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { ProfileStore } from '../../server/src/store.ts';
import { Recordings, speakable } from '../../server/src/tts.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lernwelt-tts-'));
  await mkdir(join(dir, 'tts', 'en'), { recursive: true });
  await writeFile(join(dir, 'tts', 'en', 'red.mp3'), 'mp3:red:normal');
  await writeFile(join(dir, 'tts', 'en', 'red.slow.mp3'), 'mp3:red:slow');
  await mkdir(join(dir, 'tts', 'de'), { recursive: true });
  await writeFile(join(dir, 'tts', 'de', '0123456789abcdef.mp3'), 'mp3:de:knopf');
  await writeGerman({ 'Der leuchtende Knopf ist richtig.': '0123456789abcdef.mp3', 'Böse.': '../en/red.mp3' });
});

function writeGerman(texts: Record<string, string>): Promise<void> {
  return writeFile(join(dir, 'tts', 'de', 'manifest.json'), JSON.stringify({ voice: 'en-us-varo', texts }));
}
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('recordings', () => {
  it('exist only for the English words of the app', () => {
    expect(speakable('en', 'red')).toBe(true);
    expect(speakable('en', 'seventeen')).toBe(true);
    expect(speakable('en', 'Red')).toBe(false);
    expect(speakable('en', '../red')).toBe(false);
    expect(speakable('de', 'rot')).toBe(false);
  });

  it('are read from <lang>/<word>.mp3 and <word>.slow.mp3', async () => {
    const recordings = new Recordings(join(dir, 'tts'));
    expect((await recordings.get('en', 'red', false))?.toString()).toBe('mp3:red:normal');
    expect((await recordings.get('en', 'red', true))?.toString()).toBe('mp3:red:slow');
    expect(await recordings.get('en', 'blue', false)).toBeNull();
    expect(await recordings.get('en', 'hello', false)).toBeNull();
  });
});

describe('GET /api/tts', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    const store = new ProfileStore(join(dir, 'profiles'));
    await store.init();
    server = createServer(createApp({ store, recordings: new Recordings(join(dir, 'tts')) }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise((resolve) => server.close(resolve)));

  it('answers the recording as MP3 without sign-in', async () => {
    const res = await fetch(`${base}/api/tts?lang=en&word=red&slow=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('mp3:red:slow');
  });

  it('lets browsers revalidate with the ETag', async () => {
    const first = await fetch(`${base}/api/tts?lang=en&word=red`);
    expect(first.headers.get('cache-control')).toBe('no-cache');
    const etag = first.headers.get('etag')!;
    const again = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    await writeFile(join(dir, 'tts', 'en', 'red.mp3'), 'mp3:red:new take');
    const changed = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { 'If-None-Match': etag } });
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe('mp3:red:new take');
  });

  it('answers byte ranges', async () => {
    const part = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { Range: 'bytes=0-3' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 0-3/14');
    expect(await part.text()).toBe('mp3:');
    const tail = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { Range: 'bytes=-6' } });
    expect(await tail.text()).toBe('normal');
    const outside = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { Range: 'bytes=20-' } });
    expect(outside.status).toBe(416);
  });

  it('answers a range of a replaced recording with the whole new one', async () => {
    const etag = (await fetch(`${base}/api/tts?lang=en&word=red`)).headers.get('etag')!;
    const same = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { Range: 'bytes=0-3', 'If-Range': etag } });
    expect(same.status).toBe(206);
    await writeFile(join(dir, 'tts', 'en', 'red.mp3'), 'mp3:red:new take');
    const changed = await fetch(`${base}/api/tts?lang=en&word=red`, { headers: { Range: 'bytes=0-3', 'If-Range': etag } });
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe('mp3:red:new take');
  });

  it('answers German sentences from the manifest, and lists them', async () => {
    const res = await fetch(`${base}/api/tts?lang=de&text=${encodeURIComponent('Der leuchtende Knopf ist richtig.')}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('mp3:de:knopf');
    expect((await fetch(`${base}/api/tts?lang=de&text=Hallo`)).status).toBe(404);
    expect((await fetch(`${base}/api/tts?lang=de&text=${'a'.repeat(1001)}`)).status).toBe(400);
    // Only file names the render script writes: no way out of the directory.
    expect((await fetch(`${base}/api/tts?lang=de&text=B%C3%B6se.`)).status).toBe(404);
    const list = await fetch(`${base}/api/tts/texts?lang=de`);
    expect(await list.json()).toEqual({ texts: ['Der leuchtende Knopf ist richtig.'] });
  });

  it('reads the German manifest again after an upload', async () => {
    expect((await fetch(`${base}/api/tts?lang=de&text=Neu.`)).status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeGerman({ 'Neu.': '0123456789abcdef.mp3' });
    expect((await fetch(`${base}/api/tts?lang=de&text=Neu.`)).status).toBe(200);
  });

  it('rejects other words and reports a missing recording', async () => {
    expect((await fetch(`${base}/api/tts?lang=en&word=hello`)).status).toBe(400);
    expect((await fetch(`${base}/api/tts?lang=en&word=..%2Fred`)).status).toBe(400);
    expect((await fetch(`${base}/api/tts?lang=en&word=blue`)).status).toBe(404);
  });
});
