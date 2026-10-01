/* Unity accounts — username + password, synced data stored as JSON files.
   Storage lives in DATA_DIR (defaults to the Railway volume mount, else ./data).
   Without a Railway volume, accounts are wiped on every redeploy. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const DB_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_DAYS = 60;
const MAX_DATA = 2 * 1024 * 1024;

fs.mkdirSync(USERS_DIR, { recursive: true });

let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db.users ||= {}; db.sessions ||= {}; } catch {}

function writeAtomic(file, text) { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
let saveT = null;
function saveDb() { clearTimeout(saveT); saveT = setTimeout(() => { try { writeAtomic(DB_FILE, JSON.stringify(db)); } catch (e) { console.error('[accounts] save failed', e.message); } }, 200); }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const validName = (u) => typeof u === 'string' && /^[a-z0-9_]{3,20}$/.test(u);
const validPw = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 200;

function newSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[sha(token)] = { u: username, exp: Date.now() + SESSION_DAYS * 864e5 };
  // drop expired sessions while we're here
  for (const [k, v] of Object.entries(db.sessions)) if (v.exp < Date.now()) delete db.sessions[k];
  saveDb();
  return token;
}
function auth(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  const s = db.sessions[sha(tok)];
  if (!s || s.exp < Date.now() || !db.users[s.u]) return null;
  return { username: s.u, key: sha(tok) };
}
const userFile = (u) => path.join(USERS_DIR, u + '.json');
function readData(u) { try { return JSON.parse(fs.readFileSync(userFile(u), 'utf8')); } catch { return { data: null, updatedAt: 0 }; } }

module.exports = function mountAccounts(app, rateLimit) {
  const authLimit = rateLimit({ windowMs: 15 * 60000, max: 30, standardHeaders: true, legacyHeaders: false });
  const need = (req, res, next) => { const a = auth(req); if (!a) return res.status(401).json({ error: 'Sign in again — your session expired.' }); req.user = a; next(); };

  app.post('/api/account/signup', authLimit, (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase(), password = req.body?.password;
    if (!validName(username)) return res.status(400).json({ error: 'Usernames are 3–20 characters: letters, numbers and _.' });
    if (!validPw(password)) return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
    if (db.users[username]) return res.status(409).json({ error: 'That username is taken.' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[username] = { salt, hash: hashPw(password, salt), created: Date.now() };
    saveDb();
    res.json({ token: newSession(username), username });
  });

  app.post('/api/account/login', authLimit, (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase(), password = String(req.body?.password || '');
    const u = db.users[username];
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) return res.status(401).json({ error: 'Wrong username or password.' });
    res.json({ token: newSession(username), username });
  });

  app.post('/api/account/logout', need, (req, res) => { delete db.sessions[req.user.key]; saveDb(); res.json({ ok: true }); });

  app.get('/api/account/me', need, (req, res) => {
    const u = db.users[req.user.username], d = readData(req.user.username);
    res.json({ username: req.user.username, created: u.created, updatedAt: d.updatedAt || 0 });
  });

  app.get('/api/account/data', need, (req, res) => res.json(readData(req.user.username)));

  app.put('/api/account/data', need, (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Nothing to save.' });
    const text = JSON.stringify({ data, updatedAt: Date.now() });
    if (text.length > MAX_DATA) return res.status(413).json({ error: 'Your synced data is over 2 MB. Clear old AI chats or notes.' });
    try { writeAtomic(userFile(req.user.username), text); } catch (e) { return res.status(500).json({ error: 'Could not save: ' + e.message }); }
    res.json({ updatedAt: JSON.parse(text).updatedAt });
  });

  app.post('/api/account/password', need, authLimit, (req, res) => {
    const u = db.users[req.user.username], { current, next: pw } = req.body || {};
    if (!crypto.timingSafeEqual(Buffer.from(hashPw(String(current || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return res.status(401).json({ error: 'Your current password is wrong.' });
    if (!validPw(pw)) return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
    u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPw(pw, u.salt);
    for (const [k, v] of Object.entries(db.sessions)) if (v.u === req.user.username && k !== req.user.key) delete db.sessions[k];
    saveDb(); res.json({ ok: true });
  });

  app.post('/api/account/delete', need, authLimit, (req, res) => {
    const u = db.users[req.user.username];
    if (!crypto.timingSafeEqual(Buffer.from(hashPw(String(req.body?.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return res.status(401).json({ error: 'Wrong password.' });
    delete db.users[req.user.username];
    for (const [k, v] of Object.entries(db.sessions)) if (v.u === req.user.username) delete db.sessions[k];
    try { fs.unlinkSync(userFile(req.user.username)); } catch {}
    saveDb(); res.json({ ok: true });
  });

  console.log(`[accounts] storing data in ${DATA_DIR}${process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR ? '' : ' (no volume: accounts reset on redeploy)'}`);
};
