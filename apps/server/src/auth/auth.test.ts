import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { openDatabase, migrate } from '../database/index.js';
it('persists hashed sessions, rejects wrong passwords and origins, invalidates logout', async () => {
  const dir=mkdtempSync(join(tmpdir(),'board-auth-')); const path=join(dir,'db.sqlite');
  const {sqlite}=openDatabase(path); migrate(sqlite); sqlite.close();
  const {app}=createApp({databasePath:path,origin:'http://localhost:5173',logger:false});
  const headers={origin:'http://localhost:5173'}; const payload={username:'Tester',password:'password-12345'};
  try {
    expect((await app.inject({method:'POST',url:'/api/auth/register',payload})).statusCode).toBe(403);
    const registered=await app.inject({method:'POST',url:'/api/auth/register',headers,payload}); expect(registered.statusCode).toBe(200);
    const cookie=String(registered.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toContain('board_session='); expect(String(registered.headers['set-cookie'])).toContain('HttpOnly');
    expect((await app.inject({url:'/api/auth/me',headers:{cookie}})).json().user.username).toBe('tester');
    expect((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{...payload,password:'wrong-password'}})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:'/api/auth/login',headers,payload})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url:'/api/auth/register',headers,payload})).statusCode).toBe(409);
    await app.close();
    const restarted=createApp({databasePath:path,origin:'http://localhost:5173',logger:false}).app;
    try { expect((await restarted.inject({url:'/api/auth/me',headers:{cookie}})).statusCode).toBe(200); await restarted.inject({method:'POST',url:'/api/auth/logout',headers:{...headers,cookie},payload:{}}); expect((await restarted.inject({url:'/api/auth/me',headers:{cookie}})).statusCode).toBe(401); }
    finally { await restarted.close(); }
    const check=openDatabase(path); expect((check.sqlite.prepare('SELECT password_hash FROM users').get() as {password_hash:string}).password_hash).not.toContain(payload.password); check.sqlite.close();
  } finally { if (!app.server.listening) await app.close(); rmSync(dir,{recursive:true,force:true}); }
});
it('keeps production account writes disabled over HTTP', async () => {
  const {app}=createApp({databasePath:':memory:',origin:'http://example.com',production:true,logger:false});
  try { expect((await app.inject('/api/auth/status')).json().enabled).toBe(false); expect((await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:'http://example.com'},payload:{}})).statusCode).toBe(503); }
  finally { await app.close(); }
});
