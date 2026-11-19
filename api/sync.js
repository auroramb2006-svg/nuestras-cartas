// Guarda y devuelve la actividad de la app (va cifrada: solo el editor puede leerla).
const { put, get } = require('@vercel/blob');
const PATH = 'sync/estado.json';
const ACCESS = ['private', 'public'];

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (typeof req.body === 'string') return req.body;
  return await new Promise((ok, ko) => { let d = ''; req.on('data', c => { d += c; if (d.length > 300000) ko(new Error('big')); }); req.on('end', () => ok(d)); req.on('error', ko); });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.length > 300000) return res.status(413).json({ error: 'too_large' });
      const o = JSON.parse(body);
      if (!o || o.v !== 1 || !o.k || !o.iv || !o.ct) return res.status(400).json({ error: 'bad' });
      let last;
      for (const access of ACCESS) {
        try {
          await put(PATH, JSON.stringify(o), { access, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
          return res.status(200).json({ ok: true });
        } catch (e) { last = e; }
      }
      throw last;
    }
    if (req.method === 'GET') {
      for (const access of ACCESS) {
        try {
          const r = await get(PATH, { access, useCache: false });
          if (r && r.stream) { const txt = await new Response(r.stream).text(); res.setHeader('Content-Type', 'application/json'); return res.status(200).send(txt); }
        } catch (e) { /* probar la otra forma de acceso */ }
      }
      return res.status(404).json({ error: 'empty' });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    const msg = String(e && e.message || e);
    return res.status(500).json({ error: /token|store/i.test(msg) ? 'no_store' : 'server', message: msg.slice(0, 200) });
  }
};
