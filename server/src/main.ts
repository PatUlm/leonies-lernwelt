import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { ProfileStore } from './store.ts';

const port = Number(process.env.PORT ?? 8081);
const store = new ProfileStore(process.env.DATA_DIR ?? '/data/profiles');
await store.init();

const signupsPerClient = process.env.SIGNUPS_PER_CLIENT ? Number(process.env.SIGNUPS_PER_CLIENT) : undefined;
const server = createServer(createApp({ store, maxProfiles: Number(process.env.MAX_PROFILES ?? 200), signupsPerClient }));
server.requestTimeout = 10_000;
server.listen(port, () => console.log(`lernwelt api listening on :${port}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
