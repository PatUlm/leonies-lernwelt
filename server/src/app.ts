import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FailureLimiter, hashPin, hashToken, isValidPin, newToken, normalizeName, profileId, verifyPin,
} from './auth.ts';
import type { Profile, ProfileStore } from './store.ts';

export interface AppOptions {
  store: ProfileStore;
  /** Upper bound for profiles, so an open sign-up cannot fill the disk. */
  maxProfiles?: number;
  /** Largest accepted request body (saved progress included). */
  maxBodyBytes?: number;
  now?: () => number;
}

const MAX_TOKENS_PER_PROFILE = 10;
const LOGIN_FAILURES_PER_PROFILE = 5;
const LOGIN_FAILURES_PER_CLIENT = 20;
const SIGNUPS_PER_CLIENT = 5;
const QUARTER_HOUR = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// No parameter properties: Node runs this file with type stripping only.
class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: string, extra: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(json);
}

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too_large');
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

/** Client address as seen by Traefik (X-Real-Ip), else the socket. */
function clientKey(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  return (typeof real === 'string' && real) || req.socket.remoteAddress || 'unknown';
}

/** Runs async jobs strictly one after another. */
function serial(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (job) => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function progressView(p: Profile) {
  return { name: p.name, revision: p.revision, updatedAt: p.updatedAt, data: p.data };
}

/** Points the app reported for `week` with its last upload; 0 for any other week. */
function weekPoints(p: Profile, week: string): number {
  const score = (p.data as { score?: { week?: unknown; points?: unknown } } | null)?.score;
  const points = score?.points;
  if (score?.week !== week || typeof points !== 'number' || !Number.isFinite(points)) return 0;
  return Math.max(0, Math.floor(points));
}

export function createApp(options: AppOptions) {
  const { store } = options;
  const maxProfiles = options.maxProfiles ?? 200;
  const maxBody = options.maxBodyBytes ?? 256 * 1024;
  const now = options.now ?? Date.now;
  const profileFailures = new FailureLimiter(LOGIN_FAILURES_PER_PROFILE, QUARTER_HOUR, now);
  const clientFailures = new FailureLimiter(LOGIN_FAILURES_PER_CLIENT, HOUR, now);
  const signups = new FailureLimiter(SIGNUPS_PER_CLIENT, HOUR, now);
  const loginQueue = serial();
  const signupQueue = serial();

  function blocked(...waits: number[]): void {
    const wait = Math.max(...waits);
    if (wait > 0) throw new HttpError(429, 'too_many_attempts', { retryAfterSeconds: Math.ceil(wait / 1000) });
  }

  function addToken(profile: Profile): string {
    const { token, hash } = newToken();
    const t = now();
    profile.tokens = [...profile.tokens, { hash, createdAt: t, lastUsed: t }]
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, MAX_TOKENS_PER_PROFILE);
    return token;
  }

  /** Resolves the profile of a device token; the token's profile id travels with it. */
  async function authenticate(req: IncomingMessage): Promise<{ id: string; tokenHash: string }> {
    const token = bearer(req);
    const [id, secret] = token?.split('.') ?? [];
    if (!id || !secret || !/^[0-9a-f]{64}$/.test(id)) throw new HttpError(401, 'unauthorized');
    const profile = await store.get(id);
    const tokenHash = hashToken(secret);
    if (!profile?.tokens.some((t) => t.hash === tokenHash)) throw new HttpError(401, 'unauthorized');
    return { id, tokenHash };
  }

  async function signup(req: IncomingMessage) {
    const client = clientKey(req);
    const body = await readJson(req, 4096);
    const name = normalizeName(body.name);
    if (!name) throw new HttpError(400, 'invalid_name');
    if (!isValidPin(body.pin)) throw new HttpError(400, 'invalid_pin');
    const pin = body.pin;
    const id = profileId(name);
    // One sign-up at a time: the attempt limit and the profile cap cannot be raced.
    return signupQueue(async () => {
      blocked(signups.retryAfter(client));
      signups.fail(client); // every attempt counts, before the costly PIN hash
      if (await store.get(id)) throw new HttpError(409, 'name_taken');
      if ((await store.count()) >= maxProfiles) throw new HttpError(507, 'too_many_profiles');
      const pinHash = await hashPin(pin);
      return store.update(id, async (current) => {
        if (current) throw new HttpError(409, 'name_taken');
        const t = now();
        const profile: Profile = { name, pinHash, createdAt: t, tokens: [], revision: 0, updatedAt: t, data: null };
        const token = addToken(profile);
        return { next: profile, result: { status: 201, body: { token: `${id}.${token}`, ...progressView(profile) } } };
      });
    });
  }

  async function login(req: IncomingMessage) {
    const client = clientKey(req);
    const body = await readJson(req, 4096);
    const name = normalizeName(body.name);
    if (!name || !isValidPin(body.pin)) throw new HttpError(400, 'invalid_login');
    const id = profileId(name);
    const pin = body.pin;
    // One login check at a time, so parallel guesses all see the current lock.
    return loginQueue(async () => {
      blocked(profileFailures.retryAfter(id), clientFailures.retryAfter(client));
      return store.update(id, async (profile) => {
        // Unknown names are told apart, so the app can offer a sign-up; they
        // still count against the client, which bounds probing for names.
        if (!profile) {
          clientFailures.fail(client);
          throw new HttpError(404, 'unknown_name');
        }
        if (!(await verifyPin(pin, profile.pinHash))) {
          profileFailures.fail(id);
          clientFailures.fail(client);
          throw new HttpError(401, 'wrong_login');
        }
        profileFailures.reset(id);
        const token = addToken(profile);
        return { next: profile, result: { status: 200, body: { token: `${id}.${token}`, ...progressView(profile) } } };
      });
    });
  }

  async function getProgress(req: IncomingMessage) {
    const { id } = await authenticate(req);
    const profile = await store.get(id);
    if (!profile) throw new HttpError(401, 'unauthorized');
    return { status: 200, body: progressView(profile) };
  }

  async function putProgress(req: IncomingMessage) {
    const { id, tokenHash } = await authenticate(req);
    const body = await readJson(req, maxBody);
    const base = body.baseRevision;
    if (typeof base !== 'number' || !body.data || typeof body.data !== 'object') throw new HttpError(400, 'invalid_progress');
    return store.update(id, async (profile) => {
      if (!profile) throw new HttpError(401, 'unauthorized');
      if (base !== profile.revision) {
        return { next: null, result: { status: 409, body: { error: 'conflict', ...progressView(profile) } } };
      }
      const t = now();
      profile.revision += 1;
      profile.updatedAt = t;
      profile.data = body.data;
      const token = profile.tokens.find((x) => x.hash === tokenHash);
      if (token) token.lastUsed = t;
      return { next: profile, result: { status: 200, body: { revision: profile.revision, updatedAt: t } } };
    });
  }

  /**
   * Places 1–3 of a week (shared places on a tie: 1, 1, 3) and the caller's own
   * place. The week comes from the app ("2026-09-28", its Monday), so the server
   * needs no calendar of its own.
   */
  async function leaderboard(req: IncomingMessage) {
    const { id } = await authenticate(req);
    const week = new URL(req.url ?? '/', 'http://localhost').searchParams.get('week') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new HttpError(400, 'invalid_week');
    const rows = (await store.list())
      .map(({ id: pid, profile }) => ({ name: profile.name, points: weekPoints(profile, week), me: pid === id }))
      .filter((r) => r.points > 0)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'de'));
    const ranked = rows.map((r) => ({ ...r, rank: rows.findIndex((x) => x.points === r.points) + 1 }));
    const own = ranked.find((r) => r.me);
    return {
      status: 200,
      body: {
        top: ranked.filter((r) => r.rank <= 3),
        me: { rank: own?.rank ?? null, points: own?.points ?? 0 },
      },
    };
  }

  async function logout(req: IncomingMessage) {
    const { id, tokenHash } = await authenticate(req);
    return store.update(id, async (profile) => {
      if (!profile) return { next: null, result: { status: 204, body: null } };
      profile.tokens = profile.tokens.filter((t) => t.hash !== tokenHash);
      return { next: profile, result: { status: 204, body: null } };
    });
  }

  const routes: Record<string, (req: IncomingMessage) => Promise<{ status: number; body: unknown }>> = {
    'POST /api/profiles': signup,
    'POST /api/login': login,
    'GET /api/progress': getProgress,
    'PUT /api/progress': putProgress,
    'GET /api/leaderboard': leaderboard,
    'POST /api/logout': logout,
    'GET /api/health': async () => ({ status: 200, body: { ok: true } }),
  };

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? '/').split('?')[0];
    const route = routes[`${req.method} ${path}`];
    try {
      if (!route) throw new HttpError(404, 'not_found');
      const { status, body } = await route(req);
      if (status === 204) {
        res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
      } else {
        send(res, status, body);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        const headers: Record<string, string> = {};
        if (typeof err.extra.retryAfterSeconds === 'number') headers['Retry-After'] = String(err.extra.retryAfterSeconds);
        send(res, err.status, { error: err.code, ...err.extra }, headers);
      } else {
        console.error(err);
        send(res, 500, { error: 'internal' });
      }
    }
  };
}
