// Firebase Firestore over REST (no SDK, works on any Node version). Env: FIREBASE_SERVICE_ACCOUNT = the service-account JSON (one line)
const crypto = require('crypto'), fetch = require('./fetch');
let sa = null; try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) {}
if (sa && sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const on = !!(sa && sa.project_id && sa.client_email && sa.private_key);
const b64 = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let tok = null, exp = 0;
async function token() {
  const now = Math.floor(Date.now() / 1000); if (tok && now < exp - 60) return tok;
  const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), c = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const s = b64(crypto.createSign('RSA-SHA256').update(h + '.' + c).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + h + '.' + c + '.' + s });
  const j = await r.json(); if (!r.ok) throw new Error('Firebase login failed');
  tok = j.access_token; exp = now + (j.expires_in || 3600); return tok;
}
const root = () => 'https://firestore.googleapis.com/v1/projects/' + sa.project_id + '/databases/(default)/documents';
const enc = o => { const f = {}; Object.keys(o).forEach(k => { const v = o[k]; f[k] = typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) }; }); return { fields: f }; };
const dec = d => { if (!d || !d.fields) return null; const o = {}; Object.keys(d.fields).forEach(k => { const v = d.fields[k]; o[k] = 'integerValue' in v ? parseInt(v.integerValue, 10) : 'booleanValue' in v ? v.booleanValue : 'stringValue' in v ? v.stringValue : 'timestampValue' in v ? v.timestampValue : null; }); return o; };
async function call(method, path, body) {
  const r = await fetch(root() + path, { method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {} return { r, j };
}
const fail = r => new Error('Firestore ' + r.status);
exports.on = on;
exports.get = async p => { const x = await call('GET', '/' + p); if (x.r.status === 404) return null; if (!x.r.ok) throw fail(x.r); return dec(x.j); };
exports.set = async (p, o) => { const x = await call('PATCH', '/' + p, enc(o)); if (!x.r.ok) throw fail(x.r); };
exports.create = async (p, o) => { // fails with e.conflict = true when the document already exists (atomic claim)
  const x = await call('PATCH', '/' + p + '?currentDocument.exists=false', enc(o));
  if (!x.r.ok) { const e = fail(x.r); e.conflict = x.r.status === 409 || x.r.status === 412 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(JSON.stringify(x.j)); throw e; }
};
exports.update = async (p, o) => { const q = Object.keys(o).map(k => 'updateMask.fieldPaths=' + k).join('&'); const x = await call('PATCH', '/' + p + '?currentDocument.exists=true&' + q, enc(o)); if (!x.r.ok) throw fail(x.r); };
exports.list = async c => { const x = await call('GET', '/' + c + '?pageSize=200'); if (!x.r.ok) throw fail(x.r); return (x.j.documents || []).map(d => Object.assign({ id: d.name.split('/').pop() }, dec(d))); };
exports.incr = async (p, n) => { // add n to "uses" and stamp lastUsed
  await fetch(root() + ':commit', { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [{ transform: { document: 'projects/' + sa.project_id + '/databases/(default)/documents/' + p, fieldTransforms: [{ fieldPath: 'uses', increment: { integerValue: String(n) } }, { fieldPath: 'lastUsed', setToServerValue: 'REQUEST_TIME' }] } }] }) });
};
