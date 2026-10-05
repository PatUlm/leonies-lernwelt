import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  FailureLimiter, hashPin, hashToken, isValidPin, newToken, normalizeName, profileId, verifyPin,
} from './auth.ts';
import type { Profile, ProfileStore } from './store.ts';
import { speakable, type SpeechCache } from './tts.ts';

export interface AppOptions {
  store: ProfileStore;
  /** Upper bound for profiles, so an open sign-up cannot fill the disk. */
  maxProfiles?: number;
  /** Sign-ups per client and hour (raised for the UI tests only). */
  signupsPerClient?: number;
  /** Largest accepted request body (saved progress included). */
  maxBodyBytes?: number;
  now?: () => number;
  /** Recorded English words; without it the app uses the device voice. */
  speech?: SpeechCache;
}

interface RouteResult {
  status: number;
  body: unknown;
  /** Sent as MP3 instead of the JSON body. */
  audio?: Buffer;
}

const MAX_TOKENS_PER_PROFILE = 10;
/** Upper bound for one point increment (one answer gives far less). */
const MAX_POINTS_PER_INCREMENT = 1000;
/** Safety cap only: a week of practice stays far below it. */
const POINT_IDS_KEPT = 20_000;
const LOGIN_FAILURES_PER_PROFILE = 5;
const LOGIN_FAILURES_PER_CLIENT = 20;
const SIGNUPS_PER_CLIENT = 5;
const QUARTER_HOUR = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const SWEEP_INTERVAL = 10 * 60 * 1000;

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

/**
 * Recordings change only with a new voice, so browsers may keep them a week.
 * Single byte ranges are answered, as Safari requires for media.
 */
function sendAudio(req: IncomingMessage, res: ServerResponse, audio: Buffer): void {
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=604800',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...headers, 'Content-Length': String(audio.length) }).end(audio);
    return;
  }
  const last = audio.length - 1;
  const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), last) : last;
  if (start > end) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${audio.length}` }).end();
    return;
  }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${audio.length}`, 'Content-Length': String(end - start + 1) })
    .end(audio.subarray(start, end + 1));
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function progressView(p: Profile) {
  return { name: p.name, revision: p.revision, updatedAt: p.updatedAt, data: p.data };
}

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function weekPoints(p: Profile, week: string): number {
  return p.week?.key === week ? p.week.points : 0;
}

export function createApp(options: AppOptions) {
  const { store } = options;
  const maxProfiles = options.maxProfiles ?? 200;
  const maxBody = options.maxBodyBytes ?? 256 * 1024;
  const now = options.now ?? Date.now;
  const profileFailures = new FailureLimiter(LOGIN_FAILURES_PER_PROFILE, QUARTER_HOUR, now);
  const clientFailures = new FailureLimiter(LOGIN_FAILURES_PER_CLIENT, HOUR, now);
  const signups = new FailureLimiter(options.signupsPerClient ?? SIGNUPS_PER_CLIENT, HOUR, now);
  const loginQueue = serial();
  const signupQueue = serial();
  // Client addresses leave memory at most SWEEP_INTERVAL after their window (privacy notice: 70 minutes).
  setInterval(() => {
    for (const limiter of [profileFailures, clientFailures, signups]) limiter.sweep();
  }, SWEEP_INTERVAL).unref();

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
   * Adds earned points; the server keeps the only count, so an outdated progress
   * uploaded by another device cannot lower it. Points of a newer week start
   * that week; late points of an older week (sent after being offline) are
   * dropped. Answers the week's points as counted now.
   */
  async function addPoints(req: IncomingMessage) {
    const { id } = await authenticate(req);
    const body = await readJson(req, 4096);
    const { id: incrementId, week, points } = body;
    if (typeof incrementId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(incrementId)
      || typeof week !== 'string' || !WEEK_PATTERN.test(week)
      || typeof points !== 'number' || !Number.isInteger(points) || points < 1 || points > MAX_POINTS_PER_INCREMENT) {
      throw new HttpError(400, 'invalid_points');
    }
    return store.update(id, async (profile) => {
      if (!profile) throw new HttpError(401, 'unauthorized');
      const current = profile.week;
      // Week keys are ISO dates, so they compare as strings. Ids are kept for the
      // whole current week: a retry of an older week is dropped anyway.
      if (!current || week > current.key) {
        profile.week = { key: week, points };
        profile.pointIds = [incrementId];
      } else if (week === current.key && !profile.pointIds?.includes(incrementId)) {
        current.points += points;
        profile.pointIds = [...(profile.pointIds ?? []), incrementId].slice(-POINT_IDS_KEPT);
      }
      const result = { status: 200, body: { week: profile.week ?? { key: week, points: 0 } } };
      return { next: profile, result };
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
    if (!WEEK_PATTERN.test(week)) throw new HttpError(400, 'invalid_week');
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

  /**
   * Deletes the signed-in profile with all its data (Art. 17 GDPR). The PIN
   * confirms it, so a device left signed in cannot delete the profile alone;
   * wrong PINs count like wrong logins.
   */
  async function deleteProfile(req: IncomingMessage) {
    const client = clientKey(req);
    const { id } = await authenticate(req);
    const body = await readJson(req, 4096);
    if (!isValidPin(body.pin)) throw new HttpError(400, 'invalid_pin');
    const pin = body.pin;
    return loginQueue(async () => {
      blocked(profileFailures.retryAfter(id), clientFailures.retryAfter(client));
      return store.update(id, async (profile) => {
        if (!profile) throw new HttpError(401, 'unauthorized');
        if (!(await verifyPin(pin, profile.pinHash))) {
          profileFailures.fail(id);
          clientFailures.fail(client);
          throw new HttpError(403, 'wrong_pin');
        }
        profileFailures.reset(id);
        return { next: null, remove: true, result: { status: 204, body: null } };
      });
    });
  }

  /** A recorded English word (no sign-in: the words are fixed, see tts.ts). */
  async function recording(req: IncomingMessage): Promise<RouteResult> {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const lang = params.get('lang') ?? '';
    const text = params.get('text') ?? '';
    if (!speakable(lang, text)) throw new HttpError(400, 'invalid_speech');
    if (!options.speech) throw new HttpError(503, 'tts_unavailable');
    try {
      return { status: 200, body: null, audio: await options.speech.get(lang, text, params.get('slow') === '1') };
    } catch (err) {
      console.error(err);
      throw new HttpError(503, 'tts_unavailable');
    }
  }

  const routes: Record<string, (req: IncomingMessage) => Promise<RouteResult>> = {
    'POST /api/profiles': signup,
    'POST /api/login': login,
    'GET /api/progress': getProgress,
    'PUT /api/progress': putProgress,
    'POST /api/points': addPoints,
    'GET /api/leaderboard': leaderboard,
    'POST /api/logout': logout,
    'DELETE /api/profile': deleteProfile,
    'GET /api/tts': recording,
    'GET /api/health': async () => ({ status: 200, body: { ok: true } }),
  };

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? '/').split('?')[0];
    const route = routes[`${req.method} ${path}`];
    try {
      if (!route) throw new HttpError(404, 'not_found');
      const { status, body, audio } = await route(req);
      if (audio) {
        sendAudio(req, res, audio);
      } else if (status === 204) {
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
