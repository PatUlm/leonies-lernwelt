import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('leaves no progress on the device after signing out', async () => {
    const tablet = new Device(base);
    writeJson('uhr.progress.v1', { stars: 1 });
    await tablet.client.signup('Leonie', '1234');
    await tablet.client.logout();
    expect(readJson('uhr.progress.v1')).toBeNull();
    expect(tablet.client.account()).toBeNull();
    expect(tablet.client.hasChosen()).toBe(false);
  });
});
