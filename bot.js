// Telegram bot that hands out RUNAK API keys (one key per Telegram account). Example: @ApiiMusicBot
// Runs on Render via server.js. Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BOT_OWNER_ID, FIREBASE_SERVICE_ACCOUNT, API_KEY_SECRET, SITE_URL
//      plus the usual FIREBASE_SERVICE_ACCOUNT and API_KEY_SECRET. Webhook URL: https://YOUR-SITE/api/tgbot
const db = require('./lib/db'), fetch = require('./lib/fetch'), { make, keyFor, TIERS, today } = require('./lib/keys');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hits = new Map(); // simple flood control: 20 messages per minute per user
const flood = id => { const n = Date.now(), h = hits.get(id) || { n: 0, t: n }; if (n - h.t > 60000) { h.n = 0; h.t = n; } h.n++; hits.set(id, h); return h.n > 20; };
const when = ms => ms ? new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never (Lifetime)';
async function send(chat, text) {
  try { await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }) }); } catch (e) {}
}
async function myKey(uid) { const o = await db.get('keyowners/' + uid); if (!o) return null; const k = await db.get('apikeys/' + o.keyId); return k ? { id: o.keyId, k } : null; }
function card(id, k) {
  const tier = TIERS[k.tier] ? k.tier : 'free', st = k.revoked ? '🔴 REVOKED' : (k.expires && k.expires < Date.now() ? '🟠 EXPIRED' : '🟢 ACTIVE');
  return ['🔑 ➻ <b>ʏσυʀ ᴧᴘɪ ᴋєʏ</b> ➜', '', '🔐 ➻ <b>ᴧᴘɪ ᴋєʏ</b> ➜', '<code>' + esc(keyFor(id)) + '</code>', '(Tap the key to copy)', '• ᴛɪєʀ: ' + tier.toUpperCase(), '• sᴛᴧᴛυs: ' + st, '',
    '📊 ➻ <b>ǫυσᴛᴧ & υsᴧɢє</b> ➜', '• ʀєǫυєsᴛs ᴛσᴅᴧʏ: ' + (k.day === today() ? (k.usedToday || 0) : 0) + ' / ' + (k.dailyLimit || TIERS[tier].day), '• ᴛσᴛᴧʟ ʀєǫυєsᴛs: ' + (k.uses || 0), '• sσɴɢs ᴘʟᴧʏєᴅ: ' + (k.plays || 0), '• sєᴧʀᴄʜєs: ' + (k.searches || 0), '• єxᴘɪʀᴧᴛɪσɴ: ' + when(k.expires)].join('\n');
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tok = process.env.TELEGRAM_BOT_TOKEN, sec = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (req.method !== 'POST') return res.status(200).json({ ok: true, bot: !!tok, db: db.on }); // simple status check in a browser
  if (!tok) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not set' });
  if (sec && req.headers['x-telegram-bot-api-secret-token'] !== sec) return res.status(401).json({ error: 'Bad secret' });
  const m = req.body && req.body.message; // always answer 200 so Telegram does not retry
  if (!m || !m.text || !m.from || m.from.is_bot) return res.status(200).json({ ok: true });
  const chat = m.chat.id, uid = 'tg' + m.from.id, priv = m.chat.type === 'private', cmd = (m.text.trim().split(/\s+/)[0] || '').toLowerCase().replace(/^\//, '').replace(/@\w+$/, ''), arg = m.text.trim().split(/\s+/)[1] || '';
  if (!/^\//.test(m.text.trim())) return res.status(200).json({ ok: true });
  if (flood(uid)) return res.status(200).json({ ok: true });
  const base = String(process.env.SITE_URL || 'https://' + req.headers.host).replace(/\/+$/, '');
  try {
    if (cmd === 'start' || cmd === 'help') {
      await send(chat, '🎵 <b>RUNAK MUSIC API</b>\n\nGet your free API key to use the RUNAK music API in your own bots.\n\n/getkey - create your API key (one per account)\n/mykey - show your key\n/stats - usage: requests, songs played, searches\n/plans - Free, Pro and Ultra plans\n/api - how to use it\n\n⚡ Fast • 🎵 Stable • 💠 Reliable');
    } else if (cmd === 'plans') {
      const p = Object.keys(TIERS).map(n => '• <b>' + n.toUpperCase() + '</b>: ' + TIERS[n].day + ' requests/day · ' + (TIERS[n].days ? TIERS[n].days + ' days' : 'lifetime') + ' · ' + (TIERS[n].price ? '₹' + TIERS[n].price : 'free')).join('\n');
      await send(chat, '💠 <b>Plans</b>\n\n' + p + '\n\n' + (process.env.UPI_ID ? 'Pay with FamPay/UPI to <code>' + esc(process.env.UPI_ID) + '</code>, then send the payment screenshot' + (process.env.PAY_CONTACT ? ' to ' + esc(process.env.PAY_CONTACT) : '') + '.' : 'Open the website API page to order a plan.') + '\nOrder page: ' + base + '/runakapi');
    } else if (cmd === 'api') {
      await send(chat, '📡 <b>Use your key</b>\n\nSend it in the <code>x-api-key</code> header:\n<code>' + esc(base) + '/v1/play?q=song name</code>\n\nEndpoints: /v1/search, /v1/play, /v1/autoplay, /v1/video, /v1/track\nDocs: ' + base + '/runakapi');
    } else if (cmd === 'getkey' || cmd === 'mykey' || cmd === 'stats') {
      if (!priv) return await send(chat, 'Please message me privately to get or see your key.'), res.status(200).json({ ok: true });
      if (!db.on) return await send(chat, '⚠️ The key service is not connected to its database yet. Try again later.'), res.status(200).json({ ok: true });
      let have = await myKey(uid);
      if (!have && cmd === 'getkey') { // one key per Telegram account (the claim is atomic)
        const n = make(), name = m.from.username ? '@' + m.from.username : (m.from.first_name || 'telegram user');
        try { const o = await db.get('keyowners/' + uid); if (o) await db.set('keyowners/' + uid, { keyId: n.id }); else await db.create('keyowners/' + uid, { keyId: n.id }); }
        catch (e) { if (e.conflict) have = await myKey(uid); else throw e; }
        if (!have) { const k = { name: ('tg:' + name).slice(0, 40), tier: 'free', revoked: false, uses: 0, usedToday: 0, day: '', plays: 0, searches: 0, owner: uid, expires: Date.now() + TIERS.free.days * 864e5, createdAt: Date.now() }; await db.set('apikeys/' + n.id, k); have = { id: n.id, k }; await send(chat, '✅ Your key is ready!'); }
      } else if (have && cmd === 'getkey') await send(chat, 'You already have a key. One key per account:');
      if (!have) await send(chat, 'You do not have a key yet. Send /getkey to create one.');
      else await send(chat, card(have.id, have.k));
    } else if (cmd === 'revoke' && process.env.BOT_OWNER_ID && String(m.from.id) === String(process.env.BOT_OWNER_ID)) { // owner only: /revoke <key id>
      if (!/^[0-9a-f]{12}$/.test(arg)) await send(chat, 'Usage: /revoke KEY_ID (the 12 characters after the prefix)');
      else { await db.update('apikeys/' + arg, { revoked: true, revokedAt: Date.now() }); await send(chat, '🔴 Key ' + esc(arg) + ' revoked.'); }
    } else await send(chat, 'Unknown command. Send /help');
  } catch (e) { await send(chat, '⚠️ Something went wrong. Please try again in a moment.'); }
  res.status(200).json({ ok: true });
};
