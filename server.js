// Tiny HTTP server for Render (no packages). POST /tgbot = Telegram webhook, GET / = health check.
// On start it registers the webhook with Telegram by itself, so you never call setWebhook by hand.
const http = require('http'), handler = require('./bot'), fetch = require('./lib/fetch');
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && (path === '/' || path === '/health')) return res.json({ ok: true, service: 'runak-telegram-bot' });
  if (path !== '/tgbot') return res.status(404).json({ error: 'Not found' });
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    req.query = {};
    try { await handler(req, res); } catch (e) { if (!res.writableEnded) res.status(200).json({ ok: true }); }
  });
}).listen(PORT, () => { console.log('Bot server on port ' + PORT); setHook(); });

async function setHook() {
  const tok = process.env.TELEGRAM_BOT_TOKEN, url = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  if (!tok) return console.log('TELEGRAM_BOT_TOKEN is not set');
  if (!url) return console.log('No RENDER_EXTERNAL_URL / PUBLIC_URL, webhook not set');
  try {
    const r = await fetch('https://api.telegram.org/bot' + tok + '/setWebhook', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.replace(/\/+$/, '') + '/tgbot', secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined, allowed_updates: ['message'], drop_pending_updates: false }) });
    console.log('setWebhook:', await r.text());
  } catch (e) { console.log('setWebhook failed:', e.message); }
}
