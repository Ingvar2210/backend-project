import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname);
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'notes.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS notes_owner ON notes(owner, id);`);
const list = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE owner = ? ORDER BY id DESC LIMIT 100');
const insert = db.prepare('INSERT INTO notes (owner, title, body) VALUES (?, ?, ?)');
const update = db.prepare('UPDATE notes SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner = ?');
const remove = db.prepare('DELETE FROM notes WHERE id = ? AND owner = ?');
const get = db.prepare('SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ? AND owner = ?');
const assets = new Set(['/', '/index.html', '/hub.css', '/shared.css', '/bootstrap/', '/bootstrap/index.html', '/tailwind/', '/tailwind/index.html', '/tailwind/menu.js', '/learning/', '/learning/index.html', '/learning/style.css', '/learning/script.js', '/notes/', '/notes/index.html', '/notes/style.css', '/notes/script.js', '/report/', '/report/index.html', '/report/style.css', '/report/script.js']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const securityHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function owner(req, res) {
  const match = /(?:^|;\s*)lab_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  const token = match ? match[1] : randomBytes(32).toString('hex');
  if (!match) res.setHeader('Set-Cookie', `lab_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return createHash('sha256').update(token).digest('hex');
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { const parsed = new URL(origin); return parsed.host === req.headers.host && parsed.protocol === (process.env.NODE_ENV === 'production' ? 'https:' : 'http:'); } catch { return false; }
}
async function payload(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw { status: 415, message: 'Use JSON.' };
  let raw = '';
  for await (const part of req) { raw += part; if (raw.length > 12000) throw { status: 413, message: 'Note is too large.' }; }
  let data;
  try { data = JSON.parse(raw); } catch { throw { status: 400, message: 'Invalid JSON.' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.title !== 'string' || typeof data.body !== 'string') throw { status: 400, message: 'Title and body are required.' };
  const title = data.title.trim(), body = data.body.trim();
  if (!title || title.length > 120 || !body || body.length > 5000) throw { status: 400, message: 'Use a title of 1–120 characters and a body of 1–5000 characters.' };
  return { title, body };
}
export const server = http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
  if (req.url?.startsWith('/tailwind/')) res.setHeader('Content-Security-Policy', securityHeaders['Content-Security-Policy'].replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"));
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/notes' || /^\/api\/notes\/[1-9]\d*$/.test(path)) {
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
      if (req.method !== 'GET' && !sameOrigin(req)) return json(res, 403, { error: 'Same-origin request required.' });
      const identity = owner(req, res), id = path === '/api/notes' ? null : Number(path.split('/').at(-1));
      if (id !== null && !Number.isSafeInteger(id)) return json(res, 400, { error: 'Invalid note ID.' });
      if (req.method === 'GET') return id === null ? json(res, 200, list.all(identity)) : json(res, get.get(id, identity) ? 200 : 404, get.get(id, identity) || { error: 'Note not found.' });
      if (req.method === 'POST' && id === null) { const { title, body } = await payload(req); const result = insert.run(identity, title, body); return json(res, 201, get.get(result.lastInsertRowid, identity)); }
      if (req.method === 'PUT' && id !== null) { const { title, body } = await payload(req); return json(res, update.run(title, body, id, identity).changes ? 200 : 404, get.get(id, identity) || { error: 'Note not found.' }); }
      if (req.method === 'DELETE' && id !== null) return json(res, remove.run(id, identity).changes ? 200 : 404, { deleted: true });
      return json(res, 405, { error: 'Method not allowed.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    if (!assets.has(path)) return json(res, 404, { error: 'Not found.' });
    const filename = path.endsWith('/') ? `${path}index.html` : path;
    const body = await readFile(join(root, filename));
    res.writeHead(200, { 'Content-Type': types[extname(filename)], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) { json(res, err.status || 500, { error: err.status ? err.message : 'Server error.' }); }
});
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Lab running at http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
