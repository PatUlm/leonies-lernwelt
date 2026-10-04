import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DeviceToken {
  hash: string;
  createdAt: number;
  lastUsed: number;
}

export interface Profile {
  name: string;
  pinHash: string;
  createdAt: number;
  tokens: DeviceToken[];
  /** Increases with every saved progress; used to detect concurrent writes. */
  revision: number;
  updatedAt: number;
  /** The app's saved state (opaque to the server). */
  data: unknown;
}

/** One JSON file per profile; writes are atomic (temp file + rename) and serialised. */
export class ProfileStore {
  private readonly queue = new Map<string, Promise<unknown>>();
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private file(id: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('invalid profile id');
    return join(this.dir, `${id}.json`);
  }

  async get(id: string): Promise<Profile | null> {
    try {
      return JSON.parse(await readFile(this.file(id), 'utf8')) as Profile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async count(): Promise<number> {
    return (await readdir(this.dir)).filter((f) => f.endsWith('.json')).length;
  }

  /** All profiles with their ids (one could vanish while reading: it is left out). */
  async list(): Promise<{ id: string; profile: Profile }[]> {
    const ids = (await readdir(this.dir)).filter((f) => /^[0-9a-f]{64}\.json$/.test(f)).map((f) => f.slice(0, -5));
    const profiles = await Promise.all(ids.map(async (id) => ({ id, profile: await this.get(id) })));
    return profiles.filter((p): p is { id: string; profile: Profile } => p.profile !== null);
  }

  /** Runs read-modify-write for one profile without interleaving. */
  update<T>(id: string, fn: (current: Profile | null) => Promise<{ next: Profile | null; result: T }>): Promise<T> {
    const previous = this.queue.get(id) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const { next, result } = await fn(await this.get(id));
      if (next) {
        const target = this.file(id);
        const tmp = `${target}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(next));
        await rename(tmp, target);
      }
      return result;
    });
    this.queue.set(id, run);
    const cleanup = () => {
      if (this.queue.get(id) === run) this.queue.delete(id);
    };
    // The caller handles rejections; this branch only tidies up.
    run.then(cleanup, cleanup);
    return run;
  }
}
