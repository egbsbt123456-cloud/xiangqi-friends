import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
export interface SessionUser { id: string; username: string; nickname: string; role: string }
export function sessionUser(sqlite: Database.Database, cookie?: string): SessionUser | undefined {
  const token = cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('board_session='))?.slice(14);
  if (!token) return;
  return sqlite.prepare("SELECT u.id,u.username,u.nickname,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'").get(createHash('sha256').update(token).digest('hex'), Date.now()) as SessionUser | undefined;
}
