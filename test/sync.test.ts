import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/src/app.ts';
import { ProfileStore } from '../server/src/store.ts';
import { readJson, writeJson } from '../src/shared/storage';
import { SyncClient } from '../src/shared/sync';

/** A device: its own localStorage and sync client. */
class Device {
  readonly storage = new Map<string, string>();
  readonly client: SyncClient;
  online = true;

  constructor(base: string) {
    this.use();
    this.client = new SyncClient(async (input, init) => {
      if (!this.online) throw new TypeError('offline');
      return fetch(base + String(input).replace(/^\.\/api/, '/api'), init);
    });
  }

  /** Makes this device's storage the global one. */
  use(): this {
    const s = this.storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() { return s.size; },
        key: (i: number) => [...s.keys()][i] ?? null,
        getItem: (k: string) => s.get(k) ?? null,
        setItem: (k: string, v: string) => void s.set(k, v),
        removeItem: (k: string) => void s.delete(k),
      },
    });
    return this;
  }
}

let dir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lernwelt-sync-'));
  const store = new ProfileStore(dir);
  await store.init();
  server = createServer(createApp({ store }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe('SyncClient', () => {
  it('moves the progress played so far into a new profile and onto a second device', async () => {
    const tablet = new Device(base);
    writeJson('uhr.progress.v1', { stars: 7 });
    await tablet.client.signup('Leonie', '1234');
    expect(tablet.client.status()).toBe('saved');

    const phone = new Device(base);
    phone.use();
    expect(readJson('uhr.progress.v1')).toBeNull();
    await phone.client.login('leonie', '1234');
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 7 });
  });

  it('keeps changes made offline and uploads them later', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    tablet.online = false;
    writeJson('uhr.progress.v1', { stars: 9 });
    await tablet.client.push();
    expect(tablet.client.status()).toBe('offline');
    tablet.online = true;
    await tablet.client.push();
    expect(tablet.client.status()).toBe('saved');

    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 9 });
  });

  it('lets the newer change win when two devices played', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');

    tablet.use();
    writeJson('uhr.progress.v1', { from: 'tablet' });
    await tablet.client.push();

    phone.use();
    await new Promise((r) => setTimeout(r, 5));
    writeJson('uhr.progress.v1', { from: 'phone' }); // later than the tablet's change
    await phone.client.push(); // conflict: phone is newer and wins

    tablet.use();
    await tablet.client.pull();
    expect(readJson('uhr.progress.v1')).toEqual({ from: 'phone' });
  });

  it('takes the server state on pull when this device has no newer changes', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');
    writeJson('uhr.progress.v1', { from: 'phone' });
    await phone.client.push();

    tablet.use();
    await tablet.client.pull();
    expect(readJson('uhr.progress.v1')).toEqual({ from: 'phone' });
  });

  it('refuses to sign out while changes are not on the server yet', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    tablet.online = false;
    writeJson('uhr.progress.v1', { stars: 5 });
    await expect(tablet.client.logout()).rejects.toMatchObject({ code: 'unsaved' });
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 5 });
    expect(tablet.client.account()?.name).toBe('Leonie');
  });

  it('keeps server data back while an exercise is running', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');
    writeJson('uhr.progress.v1', { from: 'phone' });
    await phone.client.push();

    tablet.use();
    let inExercise = true;
    tablet.client.setApplyGuard(() => !inExercise);
    await tablet.client.pull();
    expect(readJson('uhr.progress.v1')).toBeNull();
    inExercise = false;
    await tablet.client.applyDeferred();
    expect(readJson('uhr.progress.v1')).toEqual({ from: 'phone' });
  });

  it('decides conflicts by when a change was made, not when it was uploaded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const tablet = new Device(base);
      await tablet.client.signup('Leonie', '1234');
      const phone = new Device(base);
      phone.use();
      await phone.client.login('Leonie', '1234');

      // The tablet plays first but is offline …
      tablet.use();
      tablet.online = false;
      vi.setSystemTime(1_000_000);
      writeJson('uhr.progress.v1', { from: 'tablet' });
      await tablet.client.push();

      // … the phone plays later and uploads.
      phone.use();
      vi.setSystemTime(2_000_000);
      writeJson('uhr.progress.v1', { from: 'phone' });
      await phone.client.push();

      // The tablet's upload comes last, but its change is older: the phone wins.
      tablet.use();
      tablet.online = true;
      vi.setSystemTime(3_000_000);
      await tablet.client.push();
      expect(readJson('uhr.progress.v1')).toEqual({ from: 'phone' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps unsaved changes when the device was signed out elsewhere', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const token = tablet.client.account()!.token;
    // The token becomes invalid (e.g. signed out on the server).
    await fetch(`${base}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    writeJson('uhr.progress.v1', { stars: 8 });
    await tablet.client.push();
    expect(tablet.client.account()).toBeNull();
    await expect(tablet.client.logout()).rejects.toMatchObject({ code: 'unsaved' });
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 8 });
    // Signing in again uploads them instead of taking the older server state.
    await tablet.client.login('Leonie', '1234');
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 8 });
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');
    expect(readJson('uhr.progress.v1')).toEqual({ stars: 8 });
  });

  it('does not apply server data kept back during an exercise once it is outdated', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');
    writeJson('uhr.progress.v1', { points: 10 });
    await phone.client.push();

    tablet.use();
    let inExercise = true;
    tablet.client.setApplyGuard(() => !inExercise);
    await tablet.client.pull(); // kept back: points 10
    await new Promise((r) => setTimeout(r, 5));
    writeJson('uhr.progress.v1', { points: 50 }); // played on, newer
    await tablet.client.push();
    inExercise = false;
    await tablet.client.applyDeferred();
    expect(readJson('uhr.progress.v1')).toEqual({ points: 50 });
  });

  it('ignores the answer to a request that started before signing out', async () => {
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const pending = tablet.client.pull();
    await tablet.client.logout();
    await pending;
    expect(tablet.client.account()).toBeNull();
    expect(readJson('uhr.progress.v1')).toBeNull();
  });

  it('leaves no progress on the device after signing out', async () => {
    const tablet = new Device(base);
    writeJson('uhr.progress.v1', { stars: 1 });
    await tablet.client.signup('Leonie', '1234');
    await tablet.client.logout();
    expect(readJson('uhr.progress.v1')).toBeNull();
    expect(tablet.client.account()).toBeNull();
    expect(tablet.client.hasChosen()).toBe(false);
  });

  it('adds points from two devices on the server, whatever progress is uploaded', async () => {
    const week = '2026-09-28';
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    const phone = new Device(base);
    phone.use();
    await phone.client.login('Leonie', '1234');

    tablet.use();
    tablet.client.addPoints(30, week);
    await tablet.client.flushPoints();
    phone.use();
    phone.client.addPoints(20, week);
    await phone.client.flushPoints();
    writeJson('uhr.progress.v1', { outdated: true });
    await phone.client.push();

    expect((await phone.client.leaderboard(week))?.me).toEqual({ rank: 1, points: 50 });
  });

  it('keeps points earned offline and sends them once later', async () => {
    const week = '2026-09-28';
    const tablet = new Device(base);
    await tablet.client.signup('Leonie', '1234');
    tablet.online = false;
    tablet.client.addPoints(15, week);
    await tablet.client.flushPoints();
    await expect(tablet.client.logout()).rejects.toMatchObject({ code: 'unsaved' });
    tablet.online = true;
    await tablet.client.flushPoints();
    await tablet.client.flushPoints();
    expect((await tablet.client.leaderboard(week))?.me).toEqual({ rank: 1, points: 15 });
    expect(readJson('points.v1')).toEqual([]);
    expect(tablet.client.status()).toBe('saved');
  });
});
