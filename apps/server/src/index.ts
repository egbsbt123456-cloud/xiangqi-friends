import { env, databasePath } from './config.js';
import { createApp } from './app.js';
const { app } = createApp({ databasePath, origin: env.WEB_ORIGIN, production: process.env.NODE_ENV === 'production' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); process.exit(0); });
await app.listen({ host: env.HOST, port: env.PORT });
