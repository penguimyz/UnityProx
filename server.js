const express = require('express');
const path = require('path');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── stealth ─────────────────────────────────────────────────
app.disable('x-powered-by');
app.use((_req, res, next) => { res.removeHeader('Server'); next(); });
app.use(express.json({ limit: '2mb' }));

// ── rate limits ──────────────────────────────────────────────
const proxyLim = rateLimit({ windowMs: 60000, max: 300 });
const aiLim = rateLimit({ windowMs: 60000, max: 40 });

// ── CORS proxy ───────────────────────────────────────────────
app.use('/fetch', proxyLim, async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'Missing ?url=' });
  let parsed;
  try { parsed = new URL(target); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const { default: fetch } = await import('node-fetch');
  try {
    const upstream = await fetch(parsed.href, {
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': parsed.origin,
        'Origin': parsed.origin,
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-ch-ua': '"Google Chrome";v="125"',
        'sec-ch-ua-platform': '"Windows"',
      },
      redirect: 'follow',
    });

    res.status(upstream.status);
    const STRIP = ['content-encoding','transfer-encoding','x-frame-options','content-security-policy','frame-options','x-content-type-options'];
    for (const [k, v] of upstream.headers.entries()) {
      if (!STRIP.includes(k.toLowerCase())) res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: 'Upstream failed', detail: err.message });
  }
});

// ── AI proxy (no client-side API key needed) ─────────────────
// Requires ANTHROPIC_API_KEY env var set in Railway
app.post('/api/ai', aiLim, async (req, res) => {
  const { model = 'claude-sonnet-4-6', messages = [] } = req.body;
  if (!messages.length) return res.status(400).json({ error: 'No messages' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured', reply: 'Set ANTHROPIC_API_KEY in Railway environment variables to enable the AI tab.' });

  const { default: fetch } = await import('node-fetch');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: 'You are the Unity AI — built into a browser proxy called Unity. Be sharp, helpful, and concise. Ocean-themed interface.',
        messages,
      }),
    });
    const data = await r.json();
    const reply = data.content?.[0]?.text || data.error?.message || 'No response from model.';
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: 'AI request failed', detail: err.message });
  }
});

// ── static ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`unity on :${PORT}`));
