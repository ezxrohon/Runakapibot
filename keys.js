// Same key format as the website (api/_auth.js), so keys made here work on your site's /v1 API.
// Needs the SAME API_KEY_SECRET (and KEY_PREFIX) as the website.
const crypto = require('crypto');
const secret = () => process.env.API_KEY_SECRET || process.env.ACTIVATION_SECRET;
const sig = id => crypto.createHmac('sha256', secret()).update('api:' + id).digest('hex').slice(0, 16);
const prefix = () => { const p = String(process.env.KEY_PREFIX || '').toLowerCase(); return /^[a-z0-9]{2,12}$/.test(p) && p !== String(process.env.ADMIN_PASSWORD || '').toLowerCase() ? p : 'rk'; };
const TIERS = { free: { day: 900, min: 60, days: 30, price: 0 }, pro: { day: 6000, min: 300, days: 90, price: 90 }, ultra: { day: 200000, min: 1000, days: 0, price: 160 } };
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
exports.TIERS = TIERS; exports.today = today;
exports.keyFor = id => prefix() + '_' + id + '_' + sig(id);
exports.make = () => { const id = crypto.randomBytes(6).toString('hex'); return { id, key: prefix() + '_' + id + '_' + sig(id) }; };
