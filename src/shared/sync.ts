import { onWrite, readJson, remove, replaceSyncedEntries, syncedEntries, writeJson } from './storage';

/**
 * Keeps the progress on the server for a profile (name + 4-digit PIN).
 * The device keeps working offline; changes are uploaded when possible.
 * Conflicts between devices: the newer change wins.
 */

export interface Account {
  name: string;
  /** Device token issued by the server. */
  token: string;
}

/** "local": the family chose to play on this device only. */
type AccountState = Account | { local: true } | null;

interface SyncState {
  /** Server revision the local data is based on. */
  revision: number;
  /** Local changes not uploaded yet. */
  dirty: boolean;
  /** When the local data last changed (ms). */
  updatedAt: number;
}

export type SyncStatus = 'none' | 'local' | 'saved' | 'pending' | 'offline';

interface ServerProgress {
  name: string;
  revision: number;
  updatedAt: number;
  data: { entries?: Record<string, unknown> } | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

const API = './api';
const PUSH_DELAY_MS = 1500;

export class SyncClient {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pushing: Promise<void> | null = null;
  private online = true;
  private readonly statusListeners = new Set<(s: SyncStatus) => void>();
  private readonly remoteListeners = new Set<() => void>();

  constructor(private readonly fetchFn: typeof fetch = (...args) => fetch(...args)) {
    onWrite(() => this.markDirty());
  }

  // --- state ---------------------------------------------------------------

  account(): Account | null {
    const a = readJson<AccountState>('account.v1');
    return a && 'token' in a ? a : null;
  }

  /** True once a choice was made (profile or this device only). */
  hasChosen(): boolean {
    return readJson<AccountState>('account.v1') !== null;
  }

  playLocally(): void {
    writeJson('account.v1', { local: true });
    this.emitStatus();
  }

  /** Back to "Wer lernt hier?" from playing locally; the local progress stays. */
  chooseAgain(): void {
    if (this.account()) return;
    remove('account.v1');
    this.emitStatus();
  }

  private state(): SyncState {
    return { revision: 0, dirty: false, updatedAt: 0, ...readJson<SyncState>('sync.v1') };
  }

  private setState(s: SyncState): void {
    writeJson('sync.v1', s);
  }

  status(): SyncStatus {
    if (!this.hasChosen()) return 'none';
    if (!this.account()) return 'local';
    if (!this.online) return 'offline';
    return this.state().dirty ? 'pending' : 'saved';
  }

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Called when progress from the server replaced the local data. */
  onRemoteData(fn: () => void): () => void {
    this.remoteListeners.add(fn);
    return () => this.remoteListeners.delete(fn);
  }

  private emitStatus(): void {
    const s = this.status();
    for (const fn of this.statusListeners) fn(s);
  }

  // --- requests ------------------------------------------------------------

  private async request(method: string, path: string, body?: unknown, token?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      this.online = false;
      this.emitStatus();
      throw new ApiError(0, 'offline');
    }
    this.online = true;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok && res.status !== 409) {
      throw new ApiError(res.status, String(json.error ?? 'error'), json.retryAfterSeconds as number | undefined);
    }
    return { status: res.status, ...json };
  }

  // --- account ---------------------------------------------------------------

  /** Creates a profile; the progress played so far on this device moves into it. */
  async signup(name: string, pin: string): Promise<void> {
    const r = (await this.request('POST', '/profiles', { name, pin })) as ServerProgress & { token: string };
    writeJson('account.v1', { name: r.name, token: r.token });
    this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now() });
    await this.push();
  }

  /** Signs in; a saved progress on the server replaces the one on this device. */
  async login(name: string, pin: string): Promise<void> {
    const r = (await this.request('POST', '/login', { name, pin })) as ServerProgress & { token: string };
    writeJson('account.v1', { name: r.name, token: r.token });
    if (r.data?.entries) {
      this.apply(r);
    } else {
      this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now() });
      await this.push();
    }
  }

  /** Uploads what is pending, signs out and leaves no progress behind on the device. */
  async logout(): Promise<void> {
    const account = this.account();
    if (account) {
      await this.push().catch(() => undefined);
      await this.request('POST', '/logout', undefined, account.token).catch(() => undefined);
    }
    clearTimeout(this.timer);
    replaceSyncedEntries({});
    remove('account.v1');
    remove('sync.v1');
    this.emitStatus();
  }

  // --- syncing -----------------------------------------------------------------

  private markDirty(): void {
    if (!this.account()) return;
    this.setState({ ...this.state(), dirty: true, updatedAt: Date.now() });
    this.emitStatus();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push().catch(() => undefined), PUSH_DELAY_MS);
  }

  /** Fetches the server state and reconciles it with local changes. */
  async pull(): Promise<void> {
    const account = this.account();
    if (!account) return;
    try {
      const server = (await this.request('GET', '/progress', undefined, account.token)) as ServerProgress;
      await this.reconcile(server);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await this.forget();
    }
    this.emitStatus();
  }

  /** Uploads local changes; on a conflict the newer side wins. */
  push(): Promise<void> {
    this.pushing ??= this.doPush().finally(() => (this.pushing = null));
    return this.pushing;
  }

  private async doPush(): Promise<void> {
    const account = this.account();
    const state = this.state();
    if (!account || !state.dirty) return;
    try {
      const r = (await this.request(
        'PUT', '/progress', { baseRevision: state.revision, data: { entries: syncedEntries() } }, account.token,
      )) as { status: number } & ServerProgress;
      if (r.status === 409) {
        await this.reconcile(r);
      } else {
        // Changes made while uploading stay dirty.
        const now = this.state();
        this.setState({ ...now, revision: r.revision, dirty: now.updatedAt > state.updatedAt });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await this.forget();
    } finally {
      this.emitStatus();
    }
  }

  private async reconcile(server: ServerProgress): Promise<void> {
    const local = this.state();
    if (server.revision === local.revision && !local.dirty) return;
    if (local.dirty && (local.updatedAt > server.updatedAt || !server.data?.entries)) {
      this.setState({ ...local, revision: server.revision });
      await this.doPush();
      return;
    }
    if (server.data?.entries) this.apply(server);
    else this.setState({ ...local, revision: server.revision });
  }

  private apply(server: ServerProgress): void {
    replaceSyncedEntries(server.data?.entries ?? {});
    this.setState({ revision: server.revision, dirty: false, updatedAt: server.updatedAt });
    for (const fn of this.remoteListeners) fn();
  }

  /** The token is no longer valid (logged out elsewhere): keep the data, drop the account. */
  private async forget(): Promise<void> {
    remove('account.v1');
    remove('sync.v1');
  }
}

export const sync = new SyncClient();
