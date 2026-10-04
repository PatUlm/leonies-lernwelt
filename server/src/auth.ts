import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Profile names: letters (incl. umlauts), digits, space and hyphen, 2–20 characters. */
const NAME_PATTERN = /^[\p{L}\d][\p{L}\d -]{0,18}[\p{L}\d]$/u;
const PIN_PATTERN = /^\d{4}$/;

export function normalizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return NAME_PATTERN.test(trimmed) ? trimmed : null;
}

/** Case-insensitive identity of a profile name. */
export function profileId(name: string): string {
  return createHash('sha256').update(name.toLocaleLowerCase('de')).digest('hex');
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A new device token; only its hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Upper bound for keys a limiter remembers (memory stays bounded under attack). */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Counts failed attempts per key (profile or client address) in a sliding
 * window; a key is blocked while it has `max` failures inside the window.
 */
export class FailureLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Milliseconds until the key may try again, 0 if not blocked. */
  retryAfter(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.max) return 0;
    return recent[recent.length - this.max] + this.windowMs - this.now();
  }

  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now()]);
    if (this.failures.size > MAX_TRACKED_KEYS / 10) this.sweep();
  }

  /** Drops expired entries; above the hard cap the oldest keys go first. */
  private sweep(): void {
    for (const key of [...this.failures.keys()]) this.recent(key);
    for (const key of this.failures.keys()) {
      if (this.failures.size <= MAX_TRACKED_KEYS) break;
      this.failures.delete(key);
    }
  }

  get size(): number {
    return this.failures.size;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }
}
