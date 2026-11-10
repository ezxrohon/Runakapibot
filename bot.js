// RUNAK MUSIC API key bot (Render). Inline-button menu, key + usage, regenerate, plans, status, owner tools.
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BOT_OWNER_ID, FIREBASE_SERVICE_ACCOUNT, API_KEY_SECRET, KEY_PREFIX, SITE_URL, UPI_ID, PAY_CONTACT
const db = require('./lib/db'), fetch = require('./lib/fetch'), { make, keyFor, TIERS, today } = require('./lib/keys');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const when = ms => ms ? new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never (Lifetime)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hits = new Map(); // flood control: 20 actions per minute per user
const flood = id => { const n = Date.now(), h = hits.get(id) || { n: 0, t: n }; if (n - h.t > 60000) { h.n = 0; h.t = n; } h.n++; hits.set(id, h); return h.n > 20; };

async function tg(method, body) {
  try { const r = await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return { ok: false }; }
}
const mk = kb => kb && kb.length ? { inline_keyboard: kb } : undefined;
const send = (chat, text, kb) => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: mk(kb) });
const edit = (chat, mid, text, kb) => tg('editMessageText', { chat_id: chat, message_id: mid, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: mk(kb) });
const b = (text, data) => ({ text, callback_data: data });
const contactUrl = () => { const c = String(process.env.PAY_CONTACT || '').replace(/^@/, ''); return /^\w{3,}$/.test(c) ? 'https://t.me/' + c : ''; };
const parseId = s => { const m = String(s || '').match(/(?:^|_)([0-9a-f]{12})(?:_|$)/); return m ? m[1] : ''; };
const bar = (used, lim) => { const f = Math.max(0, Math.min(10, Math.round(used / Math.max(lim, 1) * 10))); return '▰'.repeat(f) + '▱'.repeat(10 - f); };

// ---------- data helpers ----------
async function myKey(uid) { const o = await db.get('keyowners/' + uid); if (!o) return null; const k = await db.get('apikeys/' + o.keyId); return k ? { id: o.keyId, k } : null; }
const state = k => k.revoked ? '🔴 REVOKED' : (k.expires && k.expires < Date.now() ? '🟠 EXPIRED' : '🟢 ACTIVE');
function card(id, k) {
  const tier = TIERS[k.tier] ? k.tier : 'free';
  return ['🔑 ➻ <b>ʏσυʀ ᴧᴘɪ ᴋєʏ</b> ➜', '', '🔐 ➻ <b>ᴧᴘɪ ᴋєʏ</b> ➜', '<code>' + esc(keyFor(id)) + '</code>', '(Tap the key to copy)', '',
    '• ᴛɪєʀ: <b>' + tier.toUpperCase() + '</b>', '• sᴛᴧᴛυs: ' + state(k), '• єxᴘɪʀᴧᴛɪσɴ: ' + when(k.expires)].join('\n');
}
function usage(id, k) {
  const tier = TIERS[k.tier] ? k.tier : 'free', lim = k.dailyLimit || TIERS[tier].day, used = k.day === today() ? (k.usedToday || 0) : 0;
  return ['📊 ➻ <b>ǫυσᴛᴧ & υsᴧɢє</b> ➜', '', bar(used, lim) + ' ' + used + ' / ' + lim + ' today', '',
    '• ʀєǫυєsᴛs ᴛσᴅᴧʏ: ' + used + ' / ' + lim, '• ᴛσᴛᴧʟ ʀєǫυєsᴛs: ' + (k.uses || 0), '• sσɴɢs ᴘʟᴧʏєᴅ: ' + (k.plays || 0), '• sєᴧʀᴄʜєs: ' + (k.searches || 0),
    '• ʟᴧsᴛ υsєᴅ: ' + (k.lastUsed ? new Date(k.lastUsed).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'), '• ᴅᴧɪʟʏ ʀєsєᴛ: midnight IST', '', '<i>Numbers update about once a minute.</i>'].join('\n');
}

// ---------- screens: each returns { text, kb } so commands and buttons share them ----------
const menuBtn = [b('⬅️ Menu', 'menu')];
function home(base) {
  const kb = [[b('🔑 My API Key', 'key'), b('📊 Usage', 'usage')], [b('💎 Plans', 'plans'), { text: '📘 API Docs', url: base + '/runakapi' }], [b('🟢 API Status', 'status')]];
  if (contactUrl()) kb[2].push({ text: '🆘 Support', url: contactUrl() });
  return { text: '🎵 <b>RUNAK MUSIC API</b>\n\nGet your API key and use RUNAK music in your own Telegram music bots.\n\n⚡ Fast  •  🎵 Stable  •  💠 Reliable\n\nChoose an option below 👇', kb };
}
async function keyScreen(uid, from, create) {
  if (!db.on) return { text: '⚠️ The key service is not connected to its database yet. Try again later.', kb: [menuBtn] };
  let have = await myKey(uid), note = '';
  if (!have && create) { // one key per Telegram account (the claim is atomic)
    const n = make(), name = from.username ? '@' + from.username : (from.first_name || 'telegram user');
    try { const o = await db.get('keyowners/' + uid); if (o) await db.set('keyowners/' + uid, { keyId: n.id }); else await db.create('keyowners/' + uid, { keyId: n.id }); }
    catch (e) { if (e.conflict) have = await myKey(uid); else throw e; }
    if (!have) { const k = { name: ('tg:' + name).slice(0, 40), tier: 'free', revoked: false, uses: 0, usedToday: 0, day: '', plays: 0, searches: 0, owner: uid, expires: Date.now() + TIERS.free.days * 864e5, createdAt: Date.now() }; await db.set('apikeys/' + n.id, k); have = { id: n.id, k }; note = '✅ <b>Your key is ready!</b>\n\n'; }
  } else if (have && create) note = 'You already have a key (one per account):\n\n';
  if (!have) return { text: 'You do not have a key yet.\n\nTap the button to create your free key.', kb: [[b('🔑 Generate my key', 'getkey')], menuBtn] };
  return { text: note + card(have.id, have.k), kb: [[b('📊 Usage', 'usage'), b('🔄 Regenerate', 'regen')], menuBtn] };
}
async function usageScreen(uid) {
  if (!db.on) return { text: '⚠️ The key service is not connected to its database yet.', kb: [menuBtn] };
  const have = await myKey(uid);
  if (!have) return { text: 'You do not have a key yet.', kb: [[b('🔑 Generate my key', 'getkey')], menuBtn] };
  return { text: usage(have.id, have.k), kb: [[b('🔄 Refresh', 'usage'), b('🔑 My Key', 'key')], menuBtn] };
}
function plansScreen(base) {
  const p = Object.keys(TIERS).map(n => (n === 'free' ? '🟢' : n === 'pro' ? '🔵' : '🟣') + ' <b>' + n.toUpperCase() + '</b> — ' + TIERS[n].day + ' requests/day · ' + TIERS[n].min + '/min · ' + (TIERS[n].days ? TIERS[n].days + ' days' : 'lifetime') + ' · ' + (TIERS[n].price ? '₹' + TIERS[n].price : 'free')).join('\n');
  const pay = process.env.UPI_ID ? '\n\n💳 Pay by FamPay/UPI to <code>' + esc(process.env.UPI_ID) + '</code>' + (contactUrl() ? ', then send the payment screenshot to ' + esc(process.env.PAY_CONTACT) : '') + '.' : '';
  const kb = [[{ text: '🛒 Order a plan', url: base + '/runakapi' }]];
  if (contactUrl()) kb.push([{ text: '💬 Contact owner', url: contactUrl() }]);
  kb.push(menuBtn);
  return { text: '💠 <b>Plans</b>\n\n' + p + pay, kb };
}
function apiScreen(base) {
  return { text: '📡 <b>Use your key</b>\n\nSend it in the <code>x-api-key</code> header:\n<code>' + esc(base) + '/v1/play?q=song name</code>\n\nEndpoints: /v1/search, /v1/play, /v1/autoplay, /v1/video, /v1/track, /v1/me', kb: [[{ text: '📘 Full docs', url: base + '/runakapi' }], menuBtn] };
}
async function statusScreen(base) {
  let line;
  try { const t = Date.now(), r = await fetch(base + '/v1/health'), j = await r.json(); line = j && j.ok ? '🟢 <b>API online</b> · ' + (Date.now() - t) + ' ms' : '🟠 API answered but reports a problem'; }
  catch (e) { line = '🔴 <b>API unreachable</b>'; }
  return { text: '🟢 <b>RUNAK API status</b>\n\n' + line + '\n' + (db.on ? '🟢 Key database connected' : '🔴 Key database not connected'), kb: [[b('🔄 Refresh', 'status')], menuBtn] };
}
async function regenScreen(uid, confirm) {
  const have = await myKey(uid);
  if (!have) return { text: 'You do not have a key yet.', kb: [[b('🔑 Generate my key', 'getkey')], menuBtn] };
  const k = have.k;
  if (k.revoked) return { text: '🔴 This key was revoked by the owner, so it cannot be regenerated.' + (contactUrl() ? '\nContact ' + esc(process.env.PAY_CONTACT) + '.' : ''), kb: [menuBtn] };
  if (k.regenAt && Date.now() - k.regenAt < 36e5) return { text: '⏳ You can regenerate a key once per hour. Try again later.', kb: [[b('🔑 My Key', 'key')], menuBtn] };
  if (!confirm) return { text: '🔄 <b>Regenerate key?</b>\n\nYour current key stops working within a minute and you get a new one. Your plan, expiry and limits stay the same, usage counters reset.', kb: [[b('✅ Yes, regenerate', 'regen_ok'), b('✖ Cancel', 'key')]] };
  const n = make(), nk = { name: k.name || '', tier: k.tier || 'free', revoked: false, uses: 0, usedToday: 0, day: '', plays: 0, searches: 0, owner: uid, expires: k.expires || 0, createdAt: Date.now(), regenAt: Date.now() };
  if (k.dailyLimit) nk.dailyLimit = k.dailyLimit;
  await db.set('apikeys/' + n.id, nk); await db.set('keyowners/' + uid, { keyId: n.id }); await db.update('apikeys/' + have.id, { revoked: true, revokedAt: Date.now() });
  return { text: '✅ <b>New key created</b>\n\n' + card(n.id, nk), kb: [[b('📊 Usage', 'usage')], menuBtn] };
}
async function screen(name, ctx) { // name -> { text, kb }
  const { uid, from, base, priv } = ctx;
  if (name === 'menu') return home(base);
  if (name === 'plans') return plansScreen(base);
  if (name === 'api') return apiScreen(base);
  if (name === 'status') return await statusScreen(base);
  if (!priv) return { text: 'Please message me privately to use your key.', kb: [] };
  if (name === 'key') return await keyScreen(uid, from, false);
  if (name === 'getkey') return await keyScreen(uid, from, true);
  if (name === 'usage') return await usageScreen(uid);
  if (name === 'regen') return await regenScreen(uid, false);
  if (name === 'regen_ok') return await regenScreen(uid, true);
  return home(base);
}

// ---------- owner tools ----------
const isOwner = id => process.env.BOT_OWNER_ID && String(id) === String(process.env.BOT_OWNER_ID);
const OWNER_HELP = '👑 <b>Owner commands</b>\n\n/lookup KEY_OR_TGID - show a key\n/revoke KEY - revoke a key\n/unrevoke KEY - restore a key\n/grant KEY tier [days] - set plan (free/pro/ultra, 0 days = lifetime)\n/users - how many people started the bot\n/broadcast text - message everyone (HTML allowed)\n\n"KEY" can be the full key or just its 12-character id.';
async function broadcast(chat, text) { // runs in the background on Render
  let ok = 0, bad = 0;
  try { const us = await db.listAll('tgusers'); for (const u of us) { const r = await tg('sendMessage', { chat_id: u.id, text, parse_mode: 'HTML', disable_web_page_preview: true }); r && r.ok ? ok++ : bad++; await sleep(60); } } catch (e) {}
  await send(chat, '📣 Broadcast finished. Delivered: <b>' + ok + '</b>, failed: <b>' + bad + '</b>.');
}
async function owner(cmd, arg, rest, chat) { // returns true if it handled the command
  if (!db.on && /^(lookup|revoke|unrevoke|grant|users|broadcast)$/.test(cmd)) { await send(chat, '⚠️ Firestore is not connected.'); return true; }
  const id = parseId(arg);
  if (cmd === 'ownerhelp') { await send(chat, OWNER_HELP); return true; }
  if (cmd === 'lookup') {
    let kid = id; if (!kid && /^\d{4,}$/.test(arg)) { const o = await db.get('keyowners/tg' + arg); kid = o ? o.keyId : ''; }
    const k = kid && await db.get('apikeys/' + kid); if (!k) { await send(chat, 'Key not found. Usage: /lookup KEY_OR_TGID'); return true; }
    await send(chat, card(kid, k) + '\n\n' + usage(kid, k) + '\n\n• ᴏᴡɴєʀ: ' + esc(k.owner || '-') + ' · ' + esc(k.name || ''));
    return true;
  }
  if (cmd === 'revoke' || cmd === 'unrevoke') {
    if (!id) { await send(chat, 'Usage: /' + cmd + ' KEY'); return true; }
    if (!(await db.get('apikeys/' + id))) { await send(chat, 'Key not found.'); return true; }
    await db.update('apikeys/' + id, cmd === 'revoke' ? { revoked: true, revokedAt: Date.now() } : { revoked: false, revokedAt: 0 });
    await send(chat, (cmd === 'revoke' ? '🔴 Key ' : '🟢 Key ') + esc(id) + (cmd === 'revoke' ? ' revoked (deleted after 30 days).' : ' restored.') + ' Takes effect within a minute.'); return true;
  }
  if (cmd === 'grant') {
    const parts = rest.split(/\s+/), tier = String(parts[1] || '').toLowerCase(), k = id && await db.get('apikeys/' + id);
    if (!k || !TIERS[tier]) { await send(chat, 'Usage: /grant KEY free|pro|ultra [days]'); return true; }
    const days = parts[2] === undefined ? TIERS[tier].days : Math.min(Math.max(parseInt(parts[2], 10) || 0, 0), 3650);
    await db.update('apikeys/' + id, { tier, dailyLimit: TIERS[tier].day, expires: days ? Date.now() + days * 864e5 : 0, revoked: false, revokedAt: 0 });
    await send(chat, '✅ Key ' + esc(id) + ' is now <b>' + tier.toUpperCase() + '</b> (' + (days ? days + ' days' : 'lifetime') + ').'); return true;
  }
  if (cmd === 'users') { const us = await db.listAll('tgusers'); await send(chat, '👥 People who started the bot: <b>' + us.length + '</b>'); return true; }
  if (cmd === 'broadcast') {
    const text = rest.trim(); if (!text) { await send(chat, 'Usage: /broadcast your message'); return true; }
    send(chat, '📣 Sending…'); broadcast(chat, text); return true; // not awaited: it keeps running after we answer Telegram
  }
  return false;
}
function remember(from) { // record who started the bot (for /users and /broadcast); ignore if already stored
  if (!db.on) return;
  db.create('tgusers/' + from.id, { name: String(from.first_name || '').slice(0, 40), username: String(from.username || ''), at: Date.now() }).catch(() => {});
}

// ---------- entry point ----------
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tok = process.env.TELEGRAM_BOT_TOKEN, sec = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (req.method !== 'POST') return res.status(200).json({ ok: true, bot: !!tok, db: db.on });
  if (!tok) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not set' });
  if (sec && req.headers['x-telegram-bot-api-secret-token'] !== sec) return res.status(401).json({ error: 'Bad secret' });
  const u = req.body || {}, base = String(process.env.SITE_URL || 'https://' + req.headers.host).replace(/\/+$/, '');
  try {
    if (u.callback_query) { // button press
      const q = u.callback_query, m = q.message, from = q.from;
      if (!m || !from || from.is_bot) return res.status(200).json({ ok: true });
      if (flood('tg' + from.id)) { await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Slow down a little 🙂' }); return res.status(200).json({ ok: true }); }
      const s = await screen(String(q.data || ''), { uid: 'tg' + from.id, from, base, priv: m.chat.type === 'private' });
      await tg('answerCallbackQuery', { callback_query_id: q.id });
      await edit(m.chat.id, m.message_id, s.text, s.kb);
      return res.status(200).json({ ok: true });
    }
    const m = u.message; // always answer 200 so Telegram does not retry
    if (!m || !m.text || !m.from || m.from.is_bot || !/^\//.test(m.text.trim())) return res.status(200).json({ ok: true });
    const chat = m.chat.id, uid = 'tg' + m.from.id, priv = m.chat.type === 'private', words = m.text.trim().split(/\s+/);
    const cmd = (words[0] || '').toLowerCase().replace(/^\//, '').replace(/@\w+$/, ''), arg = words[1] || '', rest = m.text.trim().replace(/^\S+\s*/, '');
    if (flood(uid)) return res.status(200).json({ ok: true });
    if (isOwner(m.from.id) && priv && await owner(cmd, arg, m.text.trim().replace(/^\S+\s*/, ''), chat)) return res.status(200).json({ ok: true });
    if (cmd === 'start') remember(m.from);
    const map = { start: 'menu', help: 'menu', menu: 'menu', plans: 'plans', api: 'api', status: 'status', ping: 'status', getkey: 'getkey', mykey: 'key', key: 'key', stats: 'usage', usage: 'usage', regenerate: 'regen' };
    if (cmd === 'ping' && !map.ping) return res.status(200).json({ ok: true });
    const s = map[cmd] ? await screen(map[cmd], { uid, from: m.from, base, priv }) : { text: 'Unknown command. Send /start to open the menu.', kb: [[b('📋 Menu', 'menu')]] };
    await send(chat, s.text, s.kb);
  } catch (e) { const c = (u.message && u.message.chat && u.message.chat.id) || (u.callback_query && u.callback_query.message && u.callback_query.message.chat.id); if (c) await send(c, '⚠️ Something went wrong. Please try again in a moment.'); }
  res.status(200).json({ ok: true });
};
