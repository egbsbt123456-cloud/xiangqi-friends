import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
const credentials = z.object({ username: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/).transform(v => v.toLowerCase()), password: z.string().min(8).max(128) });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
const ttl = 7 * 24 * 60 * 60 * 1000;
type User = { id: string; username: string; nickname: string; role: string; status: string; password_hash: string };
const publicUser = (u: User) => ({ id: u.id, username: u.username, nickname: u.nickname, role: u.role });
export function registerAuth(app: FastifyInstance, sqlite: Database.Database, origin: string, production: boolean) {
  const secure = origin.startsWith('https://');
  const enabled = !production || secure;
  const cookie = (token: string, seconds: number) => `board_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const limits = new Map<string, { count: number; until: number }>();
  let activeHashes = 0;
  const tokenFrom = (header?: string) => header?.split(';').map(v => v.trim()).find(v => v.startsWith('board_session='))?.slice(14);
  app.get('/api/auth/status', () => ({ enabled }));
  app.get('/api/auth/me', (req, reply) => {
    const token = tokenFrom(req.headers.cookie);
    if (!token) return reply.code(401).send({ error: '请先登录' });
    const user = sqlite.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status=\'active\'').get(digest(token), Date.now()) as User | undefined;
    return user ? { user: publicUser(user) } : reply.code(401).send({ error: '登录已失效' });
  });
  for (const action of ['register', 'login', 'logout'] as const) app.post(`/api/auth/${action}`, async (req, reply) => {
    if (!enabled) return reply.code(503).send({ error: '账号服务等待 HTTPS 配置完成' });
    if (req.headers.origin !== origin) return reply.code(403).send({ error: '请求来源不允许' });
    const now = Date.now();
    if (action === 'logout') {
      const token = tokenFrom(req.headers.cookie);
      if (token) sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
      return reply.header('Set-Cookie', cookie('', 0)).send({ ok: true });
    }
    for (const [ip, limit] of limits) if (limit.until < now) limits.delete(ip);
    if (limits.size > 10000) return reply.code(429).send({ error: '请求繁忙，请稍后重试' });
    const limit = limits.get(req.ip) ?? { count: 0, until: now + 60000 };
    limits.set(req.ip, limit);
    if (++limit.count > 10) return reply.header('Retry-After', '60').code(429).send({ error: '操作太频繁，请稍后重试' });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '用户名需为 3–32 位字母、数字或下划线，密码需为 8–128 位' });
    if (activeHashes >= 2) return reply.code(429).send({ error: '请求繁忙，请稍后重试' });
    const { username, password } = parsed.data;
    let user: User | undefined;
    activeHashes++;
    try {
      if (action === 'register') {
        const salt = randomBytes(16).toString('hex');
        const hash = `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
        const id = randomUUID();
        try { sqlite.prepare('INSERT INTO users (id, username, nickname, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, username, username, hash, now); }
        catch (err) { if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.code(409).send({ error: '该用户名已被使用' }); throw err; }
        user = sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as User;
      } else {
        user = sqlite.prepare('SELECT * FROM users WHERE username=?').get(username) as User | undefined;
        const [, salt, expected] = (user?.password_hash ?? `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`).split('$');
        const actual = await derive(password, salt!);
        if (!expected || !timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !user || user.status !== 'active') return reply.code(401).send({ error: '用户名或密码错误' });
      }
      sqlite.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      const previous = tokenFrom(req.headers.cookie);
      if (previous) sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
      const token = randomBytes(32).toString('hex');
      sqlite.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(digest(token), user.id, now + ttl);
      return reply.header('Set-Cookie', cookie(token, ttl / 1000)).send({ user: publicUser(user) });
    } finally { activeHashes--; }
  });
}
