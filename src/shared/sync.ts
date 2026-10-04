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
  /** Profile the local data belongs to (kept when the account is dropped). */
  profile?: string;
}

export type SyncStatus = 'none' | 'local' | 'saved' | 'pending' | 'offline';

/** What the app stores on the server (opaque to it). */
interface SyncedData {
  entries: Record<string, unknown>;
  /** When these entries were last changed on a device. */
  changedAt: number;
}

/**
 * Points earned and not yet counted by the server. The server adds them up, so
 * a device with an outdated progress can never lower them; `id` makes a
 * retried request count once.
 */
interface PendingPoints {
  id: string;
  profile: string;
  /** Monday of the week they were earned in, see weekKey. */
  week: string;
  points: number;
}

const POINTS_KEY = 'points.v1';

export interface LeaderboardRow {
  rank: number;
  name: string;
  points: number;
  me: boolean;
}

export interface Leaderboard {
  /** Places 1–3; on a tie several profiles share a place (1, 1, 3). */
  top: LeaderboardRow[];
  /** Own place, null without points this week. */
  me: { rank: number | null; points: number };
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
  private sendingPoints: Promise<void> | null = null;
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
    return this.state().dirty || this.ownPendingPoints().length ? 'pending' : 'saved';
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
    this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now(), profile: r.name });
    await this.push();
  }

  /**
   * Signs in; a saved progress on the server replaces the one on this device.
   * Exception: unsaved changes of the same profile (e.g. left over after the
   * device was signed out remotely) are kept if they are newer.
   */
  async login(name: string, pin: string): Promise<void> {
    const gen = ++this.generation;
    const r = (await this.request('POST', '/login', { name, pin })) as unknown as ServerProgress & { token: string };
    this.assertCurrent(gen);
    writeJson('account.v1', { name: r.name, token: r.token });
    const local = this.state();
    const sameProfile = local.profile?.toLocaleLowerCase('de') === r.name.toLocaleLowerCase('de');
    if (local.dirty && sameProfile) {
      await this.reconcile(r, true);
    } else if (isRecord(r.data?.entries)) {
      this.apply(r);
    } else {
      this.setState({ revision: r.revision, dirty: true, updatedAt: Date.now(), profile: r.name });
      await this.push();
    }
    // Points earned before this device was signed out remotely.
    void this.flushPoints();
  }

  /**
   * Uploads what is pending, signs out and leaves no progress behind on the
   * device. Refuses (ApiError 'unsaved') while changes could not be uploaded.
   */
  async logout(): Promise<void> {
    const account = this.account();
    if (account) {
      if (this.state().dirty) await this.push();
      await this.flushPoints();
      // Also when the upload found the account gone: the changes are still only here.
      if (this.state().dirty || this.ownPendingPoints().length) throw new ApiError(0, 'unsaved');
      await this.request('POST', '/logout', undefined, account.token).catch(() => undefined);
    } else if (this.state().dirty) {
      throw new ApiError(0, 'unsaved');
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
    const account = this.account();
    if (!account) return;
    this.setState({ ...this.state(), dirty: true, updatedAt: Date.now(), profile: account.name });
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

  // --- points ------------------------------------------------------------------

  private pendingPoints(): PendingPoints[] {
    return readJson<PendingPoints[]>(POINTS_KEY) ?? [];
  }

  /** Queued points of the signed-in profile. */
  private ownPendingPoints(): PendingPoints[] {
    const name = this.account()?.name.toLocaleLowerCase('de');
    return name ? this.pendingPoints().filter((p) => p.profile.toLocaleLowerCase('de') === name) : [];
  }

  /** Counts earned points on the server (queued while offline). Ignored without a profile. */
  addPoints(points: number, week: string): void {
    const account = this.account();
    if (!account || points <= 0) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    writeJson(POINTS_KEY, [...this.pendingPoints(), { id, profile: account.name, week, points }]);
    this.emitStatus();
    void this.flushPoints();
  }

  /** Sends queued points of the signed-in profile, oldest first, one at a time. */
  flushPoints(): Promise<void> {
    this.sendingPoints ??= this.doFlushPoints().finally(() => {
      this.sendingPoints = null;
    });
    return this.sendingPoints;
  }

  private async doFlushPoints(): Promise<void> {
    try {
      for (;;) {
        const account = this.account();
        const next = this.ownPendingPoints()[0];
        if (!account || !next) return;
        try {
          await this.request('POST', '/points', { id: next.id, week: next.week, points: next.points }, account.token);
        } catch (err) {
          // Offline or server trouble: try again later. A rejected entry would block the queue.
          if (!(err instanceof ApiError) || err.status !== 400) return;
        }
        writeJson(POINTS_KEY, this.pendingPoints().filter((p) => p.id !== next.id));
      }
    } finally {
      this.emitStatus();
    }
  }

  /** Places 1–3 and the own place of `week`; null when signed out or offline. */
  async leaderboard(week: string): Promise<Leaderboard | null> {
    const account = this.account();
    if (!account) return null;
    try {
      const r = await this.request('GET', `/leaderboard?week=${encodeURIComponent(week)}`, undefined, account.token);
      return r as unknown as Leaderboard;
    } catch {
      return null;
    }
  }

  /** `adopt`: take over the server revision even if it is older (fresh sign-in). */
  private async reconcile(server: ServerProgress, adopt = false): Promise<void> {
    const local = this.state();
    // Older than what this device already has (e.g. kept back during an exercise).
    if (!adopt && server.revision < local.revision) {
      if (local.dirty) await this.doPush();
      return;
    }
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
    this.setState({ revision: server.revision, dirty: false, updatedAt: changedAt, profile: server.name });
    for (const fn of this.remoteListeners) fn();
  }

  /** Applies server data that arrived during an exercise (call after leaving it). */
  async applyDeferred(): Promise<void> {
    const server = this.deferred;
    this.deferred = null;
    if (server) await this.reconcile(server);
  }

  /**
   * The token is no longer valid (signed out elsewhere): drop the account but
   * keep the data and its sync state, so unsaved changes survive a new sign-in.
   */
  private forget(): void {
    this.generation += 1;
    remove('account.v1');
  }
}

export const sync = new SyncClient();
