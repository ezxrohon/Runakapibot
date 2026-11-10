// fetch() that also works on old Node versions (no global fetch): minimal https fallback.
const https = require('https'), { URL } = require('url');
function f(u, o, n) {
  o = o || {}; n = n || 0;
  return new Promise((ok, no) => {
    const x = new URL(u), h = Object.assign({}, o.headers);
    if (o.body) h['Content-Length'] = Buffer.byteLength(o.body);
    const q = https.request({ hostname: x.hostname, path: x.pathname + x.search, method: o.method || 'GET', headers: h }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) { r.resume(); return ok(f(new URL(r.headers.location, u).href, { headers: o.headers }, n + 1)); }
      const c = []; r.on('data', d => c.push(d));
      r.on('end', () => { const t = Buffer.concat(c).toString('utf8'); ok({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, url: u, text: async () => t, json: async () => JSON.parse(t) }); });
    });
    q.on('error', no); if (o.body) q.write(o.body); q.end();
  });
}
module.exports = typeof fetch === 'function' ? fetch : f;
