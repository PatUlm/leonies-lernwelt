import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { ProfileStore } from '../../server/src/store.ts';

let dir: string;
let server: Server;
let base: string;
let clock = 1_700_000_000_000;

async function start(maxProfiles = 200): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'lernwelt-api-'));
  const store = new ProfileStore(dir);
  await store.init();
  server = createServer(createApp({ store, maxProfiles, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

beforeEach(() => start());
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe('profiles and login', () => {
  it('creates a profile and returns a device token', async () => {
    const r = await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Leonie', revision: 0, data: null });
    expect(typeof r.body.token).toBe('string');
  });

  it('keeps names unique regardless of case', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    const r = await call('POST', '/api/profiles', { name: 'leonie', pin: '9999' });
    expect(r.status).toBe(409);
  });

  it('rejects invalid names and PINs', async () => {
    expect((await call('POST', '/api/profiles', { name: 'L', pin: '1234' })).status).toBe(400);
    expect((await call('POST', '/api/profiles', { name: '../etc', pin: '1234' })).status).toBe(400);
    expect((await call('POST', '/api/profiles', { name: 'Leonie', pin: '12a4' })).status).toBe(400);
    expect((await call('POST', '/api/profiles', { name: 'Leonie', pin: '12345' })).status).toBe(400);
  });

  it('logs in with the right PIN only, with the same answer for unknown names', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    expect((await call('POST', '/api/login', { name: 'LEONIE', pin: '1234' })).status).toBe(200);
    const wrong = await call('POST', '/api/login', { name: 'Leonie', pin: '0000' });
    const unknown = await call('POST', '/api/login', { name: 'Max', pin: '0000' });
    expect([wrong.status, wrong.body.error]).toEqual([401, 'wrong_login']);
    expect([unknown.status, unknown.body.error]).toEqual([401, 'wrong_login']);
  });

  it('blocks a profile after five wrong PINs for a quarter of an hour', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    for (let i = 0; i < 5; i++) await call('POST', '/api/login', { name: 'Leonie', pin: `000${i}` });
    const blocked = await call('POST', '/api/login', { name: 'Leonie', pin: '1234' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    clock += 15 * 60 * 1000 + 1;
    expect((await call('POST', '/api/login', { name: 'Leonie', pin: '1234' })).status).toBe(200);
  });

  it('stores only a hash of the PIN and of the device tokens', async () => {
    const r = await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    const [file] = await readdir(dir);
    const raw = await readFile(join(dir, file), 'utf8');
    expect(raw).not.toContain('"1234"');
    expect(raw).not.toContain(r.body.token.split('.')[1]);
  });

  it('limits the number of profiles', async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    await start(1);
    expect((await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' })).status).toBe(201);
    expect((await call('POST', '/api/profiles', { name: 'Max', pin: '1234' })).status).toBe(507);
  });
});

describe('progress', () => {
  async function token(): Promise<string> {
    return (await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' })).body.token;
  }

  it('saves and loads progress with increasing revisions', async () => {
    const t = await token();
    const put = await call('PUT', '/api/progress', { baseRevision: 0, data: { stars: 3 } }, t);
    expect(put.body.revision).toBe(1);
    const get = await call('GET', '/api/progress', undefined, t);
    expect(get.body).toMatchObject({ revision: 1, data: { stars: 3 } });
  });

  it('reports a conflict when another device saved in between', async () => {
    const t = await token();
    await call('PUT', '/api/progress', { baseRevision: 0, data: { from: 'tablet' } }, t);
    const stale = await call('PUT', '/api/progress', { baseRevision: 0, data: { from: 'phone' } }, t);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ revision: 1, data: { from: 'tablet' } });
  });

  it('rejects missing, forged and logged-out tokens', async () => {
    const t = await token();
    expect((await call('GET', '/api/progress')).status).toBe(401);
    const [id] = t.split('.');
    expect((await call('GET', '/api/progress', undefined, `${id}.forged`)).status).toBe(401);
    expect((await call('POST', '/api/logout', undefined, t)).status).toBe(204);
    expect((await call('GET', '/api/progress', undefined, t)).status).toBe(401);
  });

  it('cannot reach another profile with its own token', async () => {
    const leonie = await token();
    const max = (await call('POST', '/api/profiles', { name: 'Max', pin: '9876' })).body.token;
    const [leonieId] = leonie.split('.');
    const maxSecret = max.split('.')[1];
    expect((await call('GET', '/api/progress', undefined, `${leonieId}.${maxSecret}`)).status).toBe(401);
  });

  it('rejects oversized progress', async () => {
    const t = await token();
    const huge = { blob: 'x'.repeat(300 * 1024) };
    expect((await call('PUT', '/api/progress', { baseRevision: 0, data: huge }, t)).status).toBe(413);
  });
});
