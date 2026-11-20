// Guarda y devuelve la actividad de la app (va cifrada: solo el editor puede leerla).
const { put, get, list } = require('@vercel/blob');
const Auth = require('./_admin_auth.js');
const PATH = 'sync/estado.json'; // versión antigua (sin sesión)
const userPath = u => 'sync/u-' + u + '.json';

async function readBlob(pathname) {
  for (const access of ACCESS) {
    try { const r = await get(pathname, { access, useCache: false }); if (r && r.stream) return await new Response(r.stream).text(); } catch (e) { /* probar la otra forma */ }
  }
  return null;
}
const ACCESS = ['private', 'public'];

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (typeof req.body === 'string') return req.body;
  return await new Promise((ok, ko) => { let d = ''; req.on('data', c => { d += c; if (d.length > 300000) ko(new Error('big')); }); req.on('end', () => ok(d)); req.on('error', ko); });
}

module.exports = async (req, res) => {
  Auth.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.length > 300000) return res.status(413).json({ error: 'too_large' });
      const o = JSON.parse(body);
      if (!o || o.v !== 1 || !o.k || !o.iv || !o.ct) return res.status(400).json({ error: 'bad' });
      if (o.u !== undefined && !/^[a-z0-9]{1,13}$/.test(String(o.u))) return res.status(400).json({ error: 'bad_user' });
      const path = o.u ? userPath(o.u) : PATH;
      let last;
      for (const access of ACCESS) {
        try {
          await put(path, JSON.stringify(o), { access, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
          return res.status(200).json({ ok: true });
        } catch (e) { last = e; }
      }
      throw last;
    }
    if (req.method === 'GET') {
      if (!Auth.requireAdmin(req, res)) return;
      // Devuelve la actividad de cada persona que ha iniciado sesión (cada una va cifrada).
      let blobs = [];
      try { const r = await list({ prefix: 'sync/', limit: 100 }); blobs = r.blobs || []; }
      catch (e) { const m = String(e && e.message || e); if (/token|store/i.test(m)) return res.status(500).json({ error: 'no_store', message: m.slice(0, 200) }); }
      const items = [];
      for (const b of blobs) {
        const txt = await readBlob(b.pathname);
        if (!txt) continue;
        try { const o = JSON.parse(txt); o.legacy = b.pathname === PATH; items.push(o); } catch (e) { /* ignorar */ }
      }
      if (!items.length) return res.status(404).json({ error: 'empty' });
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(JSON.stringify({ items }));
    }
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    const msg = String(e && e.message || e);
    return res.status(500).json({ error: /token|store/i.test(msg) ? 'no_store' : 'server', message: msg.slice(0, 200) });
  }
};
