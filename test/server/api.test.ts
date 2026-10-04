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

  it('logs in with the right PIN only and tells unknown names apart', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    expect((await call('POST', '/api/login', { name: 'LEONIE', pin: '1234' })).status).toBe(200);
    const wrong = await call('POST', '/api/login', { name: 'Leonie', pin: '0000' });
    const unknown = await call('POST', '/api/login', { name: 'Max', pin: '0000' });
    expect([wrong.status, wrong.body.error]).toEqual([401, 'wrong_login']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'unknown_name']);
  });

  it('counts unknown names against the client limit', async () => {
    for (let i = 0; i < 20; i++) await call('POST', '/api/login', { name: `Max${i}`, pin: '0000' });
    expect((await call('POST', '/api/login', { name: 'Max', pin: '0000' })).status).toBe(429);
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

  it('keeps the PIN lock with parallel guesses', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    const guesses = Array.from({ length: 8 }, (_, i) => call('POST', '/api/login', { name: 'Leonie', pin: `00${10 + i}` }));
    const right = call('POST', '/api/login', { name: 'Leonie', pin: '1234' });
    const results = await Promise.all([...guesses, right]);
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.at(-1)?.status).toBe(429);
  });

  it('cannot exceed the profile cap with parallel sign-ups', async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    await start(2);
    const names = ['Anna', 'Ben', 'Carla', 'Dora', 'Emil'];
    await Promise.all(names.map((name) => call('POST', '/api/profiles', { name, pin: '1234' })));
    expect(await readdir(dir)).toHaveLength(2);
  });

  it('counts every sign-up attempt, also for taken names', async () => {
    await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    for (let i = 0; i < 4; i++) await call('POST', '/api/profiles', { name: 'Leonie', pin: '1234' });
    expect((await call('POST', '/api/profiles', { name: 'Max', pin: '1234' })).status).toBe(429);
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

describe('deleting a profile', () => {
  async function signup(name = 'Leonie'): Promise<string> {
    return (await call('POST', '/api/profiles', { name, pin: '1234' })).body.token;
  }

  it('deletes the file, the device tokens and the leaderboard entry; the name is free again', async () => {
    const leonie = await signup();
    const other = (await call('POST', '/api/login', { name: 'Leonie', pin: '1234' })).body.token;
    await call('POST', '/api/points', { id: 'inc-delete-1', week: '2026-09-28', points: 30 }, leonie);
    const max = await signup('Max');
    expect((await call('DELETE', '/api/profile', { pin: '1234' }, leonie)).status).toBe(204);
    expect(await readdir(dir)).toHaveLength(1);
    expect((await call('GET', '/api/progress', undefined, other)).status).toBe(401);
    const board = await call('GET', '/api/leaderboard?week=2026-09-28', undefined, max);
    expect(board.body.top).toEqual([]);
    expect((await call('POST', '/api/login', { name: 'Leonie', pin: '1234' })).body.error).toBe('unknown_name');
    expect((await call('POST', '/api/profiles', { name: 'Leonie', pin: '5678' })).status).toBe(201);
  });

  it('needs the right PIN and blocks after five wrong ones', async () => {
    const t = await signup();
    const wrong = await call('DELETE', '/api/profile', { pin: '0000' }, t);
    expect([wrong.status, wrong.body.error]).toEqual([403, 'wrong_pin']);
    for (let i = 1; i < 5; i++) await call('DELETE', '/api/profile', { pin: `000${i}` }, t);
    expect((await call('DELETE', '/api/profile', { pin: '1234' }, t)).status).toBe(429);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('needs a valid token and a PIN', async () => {
    const t = await signup();
    expect((await call('DELETE', '/api/profile', { pin: '1234' })).status).toBe(401);
    expect((await call('DELETE', '/api/profile', {}, t)).status).toBe(400);
    expect(await readdir(dir)).toHaveLength(1);
  });
});

describe('points and leaderboard', () => {
  const WEEK = '2026-09-28';
  let seq = 0;

  function add(token: string, points: unknown, week = WEEK, id = `inc-${++seq}-abcdef`) {
    return call('POST', '/api/points', { id, week, points }, token);
  }

  async function player(name: string, points = 0, week = WEEK): Promise<string> {
    const t = (await call('POST', '/api/profiles', { name, pin: '1234' })).body.token;
    if (points) await add(t, points, week);
    return t;
  }

  it('adds points on the server and answers the week as counted now', async () => {
    const t = await player('Anna');
    expect((await add(t, 20)).body).toEqual({ week: { key: WEEK, points: 20 } });
    expect((await add(t, 15)).body).toEqual({ week: { key: WEEK, points: 35 } });
  });

  it('counts a retried increment once', async () => {
    const t = await player('Anna');
    await add(t, 20, WEEK, 'same-id-123');
    for (let i = 0; i < 250; i++) await add(t, 1);
    expect((await add(t, 20, WEEK, 'same-id-123')).body.week.points).toBe(270);
  });

  it('starts a new week and drops late points of an older one', async () => {
    const t = await player('Anna', 40, '2026-09-21');
    expect((await add(t, 10)).body.week).toEqual({ key: WEEK, points: 10 });
    expect((await add(t, 99, '2026-09-21')).body.week).toEqual({ key: WEEK, points: 10 });
  });

  it('keeps the points when another device uploads an outdated progress', async () => {
    const t = await player('Anna', 30);
    await call('PUT', '/api/progress', { baseRevision: 0, data: { entries: { old: true }, changedAt: 1 } }, t);
    const r = await call('GET', `/api/leaderboard?week=${WEEK}`, undefined, t);
    expect(r.body.me).toEqual({ rank: 1, points: 30 });
  });

  it('rejects invalid increments', async () => {
    const t = await player('Anna');
    expect((await add(t, 0)).status).toBe(400);
    expect((await add(t, 2.5)).status).toBe(400);
    expect((await add(t, '10')).status).toBe(400);
    expect((await add(t, 5000)).status).toBe(400);
    expect((await add(t, 10, 'soon')).status).toBe(400);
    expect((await add(t, 10, WEEK, 'x')).status).toBe(400);
    expect((await call('POST', '/api/points', { id: 'no-token-1', week: WEEK, points: 5 })).status).toBe(401);
  });

  it('lists places 1–3 of the week with shared places on a tie', async () => {
    const anna = await player('Anna', 50);
    await player('Ben', 80);
    await player('Carla', 50);
    await player('Dora', 20);
    const r = await call('GET', `/api/leaderboard?week=${WEEK}`, undefined, anna);
    expect(r.status).toBe(200);
    expect(r.body.top).toEqual([
      { rank: 1, name: 'Ben', points: 80, me: false },
      { rank: 2, name: 'Anna', points: 50, me: true },
      { rank: 2, name: 'Carla', points: 50, me: false },
    ]);
    expect(r.body.me).toEqual({ rank: 2, points: 50 });
  });

  it('gives the own place outside the top 3 and leaves out other weeks', async () => {
    await player('Anna', 90);
    await player('Ben', 500, '2026-09-21');
    await player('Carla', 40);
    const dora = await player('Dora', 10);
    await player('Emil', 30);
    const r = await call('GET', `/api/leaderboard?week=${WEEK}`, undefined, dora);
    expect(r.body.top.map((x: { name: string }) => x.name)).toEqual(['Anna', 'Carla', 'Emil']);
    expect(r.body.me).toEqual({ rank: 4, points: 10 });
  });

  it('has no place without points and needs a token and a valid week', async () => {
    const t = await player('Anna');
    expect((await call('GET', `/api/leaderboard?week=${WEEK}`, undefined, t)).body.me).toEqual({ rank: null, points: 0 });
    expect((await call('GET', `/api/leaderboard?week=${WEEK}`)).status).toBe(401);
    expect((await call('GET', '/api/leaderboard?week=soon', undefined, t)).status).toBe(400);
  });
});
