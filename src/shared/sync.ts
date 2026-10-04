import { onWrite, readJson, remove, replaceSyncedEntries, syncedEntries, writeJson } from './storage';

/**
 * Keeps the progress on the server for a profile (name + 4-digit PIN).
 * The device keeps working offline; changes are uploaded when possible.
 * Between devices the later change wins (by the time it was made, not uploaded).
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
  /** When the local data last changed (ms, device clock). */
  updatedAt: number;
}

export type SyncStatus = 'none' | 'local' | 'saved' | 'pending' | 'offline';

/** What the app stores on the server (opaque to it). */
interface SyncedData {
  entries: Record<string, unknown>;
  /** When these entries were last changed on a device. */
  changedAt: number;
}

interface ServerProgress {
  name: string;
  revision: number;
  updatedAt: number;
  data: Partial<SyncedData> | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const API = './api';
const PUSH_DELAY_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SyncClient {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pushing: Promise<void> | null = null;
  private online = true;
  /**
   * Increases with every sign-in, sign-out or local choice. Answers to requests
   * started under an older generation are ignored (they belong to another account).
   */
  private generation = 0;
  /** Server data that arrived while an exercise was running. */
  private deferred: ServerProgress | null = null;
  private canApply: () => boolean = () => true;
  private readonly statusListeners = new Set<(s: SyncStatus) => void>();
  private readonly remoteListeners = new Set<() => void>();
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = (...args) => fetch(...args)) {
    this.fetchFn = fetchFn;
    onWrite(() => this.markDirty());
  }

  /**
   * While `canApply` returns false (an exercise is running), server data is
   * kept back and applied by `applyDeferred()` afterwards.
   */
  setApplyGuard(canApply: () => boolean): void {
    this.canApply = canApply;
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
    this.generation += 1;
    writeJson('account.v1', { local: true });
    this.emitStatus();
  }

  /** Back to "Wer lernt hier?" from playing locally; the local progress stays. */
  chooseAgain(): void {
    if (this.account()) return;
    this.generation += 1;
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

  private async request(method: string, path: string, body?: unknown, token?: string): Promise<Record<string, unknown>> {
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
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ApiError(res.status, 'invalid_response');
    }
    if (!res.ok && res.status !== 409) {
      const retry = typeof json.retryAfterSeconds === 'number' ? json.retryAfterSeconds : undefined;
      throw new ApiError(res.status, String(json.error ?? 'error'), retry);
    }
    return { status: res.status, ...json };
  }

  /** Throws if the account changed while a request was on its way. */
  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new ApiError(0, 'stale');
  }

  // --- account ---------------------------------------------------------------

  /** Creates a profile; the progress played so far on this device moves into it. */
  async signup(name: string, pin: string): Promise<void> {
    const gen = ++this.generation;
    const r = (await this.request('POST', '/profiles', { name, pin })) as unknown as ServerProgress & { token: string };
    this.assertCurrent(gen);
    writeJson('account.v1', { name: r.name, token: r.token });
    this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now() });
    await this.push();
  }

  /** Signs in; a saved progress on the server replaces the one on this device. */
  async login(name: string, pin: string): Promise<void> {
    const gen = ++this.generation;
    const r = (await this.request('POST', '/login', { name, pin })) as unknown as ServerProgress & { token: string };
    this.assertCurrent(gen);
    writeJson('account.v1', { name: r.name, token: r.token });
    if (isRecord(r.data?.entries)) {
      this.apply(r);
    } else {
      this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now() });
      await this.push();
    }
  }

  /**
   * Uploads what is pending, signs out and leaves no progress behind on the
   * device. Refuses (ApiError 'unsaved') while changes could not be uploaded.
   */
  async logout(): Promise<void> {
    const account = this.account();
    if (account) {
      if (this.state().dirty) await this.push();
      if (this.state().dirty) throw new ApiError(0, 'unsaved');
      await this.request('POST', '/logout', undefined, account.token).catch(() => undefined);
    }
    this.generation += 1;
    clearTimeout(this.timer);
    this.deferred = null;
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
    this.schedulePush();
  }

  private schedulePush(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push().catch(() => undefined), PUSH_DELAY_MS);
  }

  /** Fetches the server state and reconciles it with local changes. */
  async pull(): Promise<void> {
    const account = this.account();
    if (!account) return;
    const gen = this.generation;
    try {
      const server = (await this.request('GET', '/progress', undefined, account.token)) as unknown as ServerProgress;
      this.assertCurrent(gen);
      await this.reconcile(server);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && gen === this.generation) this.forget();
    }
    this.emitStatus();
  }

  /** Uploads local changes; on a conflict the later change wins. */
  push(): Promise<void> {
    this.pushing ??= this.doPush().finally(() => {
      this.pushing = null;
    });
    return this.pushing;
  }

  private async doPush(): Promise<void> {
    const account = this.account();
    const state = this.state();
    if (!account || !state.dirty) return;
    const gen = this.generation;
    const data: SyncedData = { entries: syncedEntries(), changedAt: state.updatedAt };
    let uploaded = false;
    try {
      const r = (await this.request('PUT', '/progress', { baseRevision: state.revision, data }, account.token)) as unknown as {
        status: number;
      } & ServerProgress;
      this.assertCurrent(gen);
      if (r.status === 409) {
        await this.reconcile(r);
      } else {
        // Changes made while uploading stay dirty and are uploaded next.
        const now = this.state();
        this.setState({ ...now, revision: r.revision, dirty: now.updatedAt > state.updatedAt });
        uploaded = true;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && gen === this.generation) this.forget();
    } finally {
      this.emitStatus();
    }
    if (uploaded && this.state().dirty) this.schedulePush();
  }

  private async reconcile(server: ServerProgress): Promise<void> {
    const local = this.state();
    if (server.revision === local.revision && !local.dirty) return;
    const serverChangedAt = typeof server.data?.changedAt === 'number' ? server.data.changedAt : 0;
    const serverHasData = isRecord(server.data?.entries);
    if (local.dirty && (local.updatedAt > serverChangedAt || !serverHasData)) {
      // This device has the later change: upload it on top of the server state.
      this.setState({ ...local, revision: server.revision });
      await this.doPush();
      return;
    }
    if (serverHasData) this.apply(server);
    else this.setState({ ...local, revision: server.revision });
  }

  private apply(server: ServerProgress): void {
    if (!this.canApply()) {
      this.deferred = server;
      return;
    }
    const entries = server.data?.entries;
    replaceSyncedEntries(isRecord(entries) ? entries : {});
    const changedAt = typeof server.data?.changedAt === 'number' ? server.data.changedAt : server.updatedAt;
    this.setState({ revision: server.revision, dirty: false, updatedAt: changedAt });
    for (const fn of this.remoteListeners) fn();
  }

  /** Applies server data that arrived during an exercise (call after leaving it). */
  async applyDeferred(): Promise<void> {
    const server = this.deferred;
    this.deferred = null;
    if (server) await this.reconcile(server);
  }

  /** The token is no longer valid (logged out elsewhere): keep the data, drop the account. */
  private forget(): void {
    this.generation += 1;
    remove('account.v1');
    remove('sync.v1');
  }
}

export const sync = new SyncClient();
