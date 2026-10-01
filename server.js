const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const { Readable } = require('stream');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Ollama config ─────────────────────────────────────────────
   OLLAMA_URL     where Ollama lives, e.g. http://100.101.102.103:11434 (Tailscale IP)
                  or https://my-pc.tail1234.ts.net (Tailscale Funnel)
   TS_AUTHKEY     if set, start.sh joins your tailnet and exposes an HTTP proxy on :1055
   TS_HTTP_PROXY  override the proxy address (defaults to http://127.0.0.1:1055 when TS_AUTHKEY is set)
   OLLAMA_AUTH    optional Authorization header value (if you put Ollama behind an auth proxy) */
const OLLAMA_URL = (process.env.OLLAMA_URL || '').replace(/\/+$/, '');
const OLLAMA_MODEL = 'deepseek-r1:7b'; // the only model Unity uses
const TS_PROXY = process.env.TS_HTTP_PROXY || (process.env.TS_AUTHKEY ? 'http://127.0.0.1:1055' : '');
const OLLAMA_AUTH = process.env.OLLAMA_AUTH || '';

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for per-IP rate limits
app.use((_req, res, next) => { res.removeHeader('Server'); next(); });
app.use(express.json({ limit: '2mb' }));

function ollamaRequest(method, pathname, body, idleMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!OLLAMA_URL) return reject(new Error('OLLAMA_URL is not set'));
    const target = new URL(OLLAMA_URL + pathname);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (OLLAMA_AUTH) headers.Authorization = OLLAMA_AUTH;
    let mod, opts;
    if (TS_PROXY && target.protocol === 'http:') {
      // Tailscale userspace networking: plain-HTTP forward proxy, absolute-URI request line
      const pu = new URL(TS_PROXY);
      mod = http;
      opts = { host: pu.hostname, port: pu.port || 80, path: target.href, method, headers: { ...headers, Host: target.host } };
    } else {
      mod = target.protocol === 'https:' ? https : http;
      opts = { hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: target.pathname + target.search, method, headers };
    }
    const r = mod.request(opts, resolve);
    r.on('error', reject);
    r.setTimeout(idleMs, () => r.destroy(new Error('timed out')));
    if (payload) r.write(payload);
    r.end();
  });
}

function readAll(stream) {
  return new Promise((resolve) => { let s = ''; stream.on('data', (c) => (s += c)); stream.on('end', () => resolve(s)); stream.on('error', () => resolve(s)); });
}

let statusCache = { at: 0, data: null };
async function ollamaStatus() {
  if (!OLLAMA_URL) return { configured: false, online: false, models: [], model: OLLAMA_MODEL };
  if (Date.now() - statusCache.at < 15000 && statusCache.data) return statusCache.data;
  let data;
  try {
    const r = await ollamaRequest('GET', '/api/tags', null, 5000);
    const txt = await readAll(r);
    const j = JSON.parse(txt || '{}');
    data = { configured: true, online: r.statusCode === 200, models: (j.models || []).map((m) => m.name), model: OLLAMA_MODEL, via: TS_PROXY ? 'tailscale' : 'direct' };
  } catch (e) {
    data = { configured: true, online: false, models: [], model: OLLAMA_MODEL, error: e.message, via: TS_PROXY ? 'tailscale' : 'direct' };
  }
  statusCache = { at: Date.now(), data };
  return data;
}

app.get('/ai/status', async (_req, res) => {
  const o = await ollamaStatus();
  res.json({ configured: o.configured, online: o.online && (!o.models.length || o.models.includes(OLLAMA_MODEL)), model: OLLAMA_MODEL, missingModel: o.online && o.models.length > 0 && !o.models.includes(OLLAMA_MODEL) });
});

/* ── AI relay — streams NDJSON lines: {d:"text"} {k:"think",d:"…"} {done:true} {error:"…"} ── */
app.post('/ai', rateLimit({ windowMs: 60000, max: 40 }), async (req, res) => {
  const { messages = [] } = req.body || {};
  const msgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  if (!msgs.length) return res.status(400).json({ error: 'No messages' });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (o) => res.write(JSON.stringify(o) + '\n');

  let upstream;
  let closed = false;
  res.on('close', () => { closed = true; if (upstream) upstream.destroy(); });
  try {
    upstream = await ollamaRequest('POST', '/api/chat', { model: OLLAMA_MODEL, messages: msgs, stream: true, keep_alive: '30m' });
  } catch (e) {
    send({ error: `The AI server can't be reached right now (${e.message}).` });
    return res.end();
  }
  if (upstream.statusCode !== 200) {
    const txt = await readAll(upstream);
    let msg = txt; try { msg = JSON.parse(txt).error || txt; } catch {}
    send({ error: `The AI server returned ${upstream.statusCode}: ${String(msg).slice(0, 300)}` });
    return res.end();
  }
  let buf = '';
  upstream.setEncoding('utf8');
  upstream.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.error) send({ error: j.error });
        if (j.message?.thinking) send({ k: 'think', d: j.message.thinking });
        if (j.message?.content) send({ d: j.message.content });
        if (j.done) send({ done: true, stats: { tokens: j.eval_count, ms: Math.round((j.total_duration || 0) / 1e6) } });
      } catch {}
    }
  });
  upstream.on('end', () => { if (!closed) res.end(); });
  upstream.on('error', (e) => { if (!closed) { send({ error: e.message }); res.end(); } });
});

// ── accounts + sync ──────────────────────────────────────────
require('./accounts')(app, rateLimit);

// ── CORS proxy ───────────────────────────────────────────────
app.use('/fetch', rateLimit({ windowMs: 60000, max: 300 }), async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'Missing ?url=' });
  let parsed;
  try { parsed = new URL(target); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ error: 'Only http(s) URLs' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const upstream = await fetch(parsed.href, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: req.headers.accept || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: parsed.origin,
        Origin: parsed.origin,
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    res.status(upstream.status);
    const strip = ['content-encoding', 'content-length', 'transfer-encoding', 'x-frame-options', 'content-security-policy', 'frame-options', 'connection'];
    for (const [k, v] of upstream.headers.entries()) {
      if (!strip.includes(k.toLowerCase())) res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!upstream.body) return res.end();
    // native fetch returns a web stream — convert before piping (the old .pipe() call crashed)
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(502).json({ error: 'Upstream failed', detail: err.message });
    else res.end();
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`unity on :${PORT}`);
  if (OLLAMA_URL) console.log(`[ai] ollama -> ${OLLAMA_URL} (${TS_PROXY ? 'via tailscale proxy ' + TS_PROXY : 'direct'}) model=${OLLAMA_MODEL}`);
  else console.log('[ai] OLLAMA_URL not set — the AI tab will show as offline');
});
