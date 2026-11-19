// Chat entre él (desde la app) y ella (desde el editor).
const L = require('./_push_lib.js');
const crypto = require('crypto');
const { list } = require('@vercel/blob');
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const EDITOR = 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html';
const path = uid => 'push/chat/' + uid + '.json';
const okUid = u => /^[a-z0-9]{1,13}$/.test(String(u || ''));

async function isAdmin(secret) {
  if (!secret || String(secret).length < 32) return false;
  const a = await L.readJSON('push/admin.json');
  if (!a || !a.h) { await L.writeJSON('push/admin.json', { h: sha(secret), ts: Date.now() }); return true; }
  return a.h === sha(secret);
}
const pub = th => ({ uid: th.uid, name: th.name, msgs: th.msgs || [], seenEl: th.seenEl || 0, seenElla: th.seenElla || 0 });
const unread = (th, who) => (th.msgs || []).filter(m => m.from !== who && m.ts > (who === 'el' ? th.seenEl || 0 : th.seenElla || 0)).length;

// Él: cada móvil guarda un token propio; el primero que escribe en un hilo se queda con él.
async function userThread(b) {
  if (!okUid(b.uid) || !b.tok || String(b.tok).length < 20) return [400, { error: 'bad' }];
  let th = await L.readJSON(path(b.uid));
  if (!th) th = { uid: b.uid, name: L.clip(b.name, 30), toks: [], msgs: [] };
  th.toks = th.toks || [];
  const h = sha(b.tok);
  if (!th.toks.includes(h)) {
    if (th.toks.length >= 3) return [403, { error: 'auth' }];
    th.toks.push(h);
  }
  if (b.name) th.name = L.clip(b.name, 30);
  return [200, th];
}

module.exports = async (req, res) => {
  L.cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const b = await L.readBody(req);
    if (b.action === 'get' || b.action === 'send') {
      const [code, th] = await userThread(b); if (code !== 200) return res.status(code).json(th);
      if (b.action === 'send') {
        const text = L.clip(b.text, 500).trim(); if (!text) return res.status(400).json({ error: 'empty' });
        const m = { id: crypto.randomBytes(5).toString('hex'), from: 'el', t: text, ts: Date.now() };
        th.msgs = (th.msgs || []).concat([m]).slice(-300); th.seenEl = m.ts;
        await L.writeJSON(path(th.uid), th);
        await L.vapid();
        for (const s of (await L.allSubs()).filter(s => s.role === 'admin')) await L.send(s, { title: (th.name || 'Él') + ' 👀', body: text, url: EDITOR });
      } else { th.seenEl = Date.now(); await L.writeJSON(path(th.uid), th); }
      return res.status(200).json(pub(th));
    }
    if (b.action === 'unread') {
      if (!okUid(b.uid)) return res.status(400).json({ error: 'bad' });
      const th = await L.readJSON(path(b.uid));
      return res.status(200).json({ n: th && th.toks && th.toks.includes(sha(b.tok)) ? unread(th, 'el') : 0 });
    }
    // Ella (editor)
    if (!(await isAdmin(b.secret))) return res.status(403).json({ error: 'auth' });
    if (b.action === 'threads') {
      const r = await list({ prefix: 'push/chat/', limit: 200 }); const out = [];
      for (const x of r.blobs || []) { const th = await L.readJSON(x.pathname); if (th) { const last = (th.msgs || []).slice(-1)[0] || null; out.push({ uid: th.uid, name: th.name, last, unread: unread(th, 'ella') }); } }
      return res.status(200).json({ items: out.sort((a, c) => ((c.last && c.last.ts) || 0) - ((a.last && a.last.ts) || 0)) });
    }
    if (!okUid(b.uid)) return res.status(400).json({ error: 'bad' });
    let th = await L.readJSON(path(b.uid));
    if (b.action === 'aget') {
      if (!th) return res.status(200).json({ uid: b.uid, name: L.clip(b.name, 30), msgs: [] });
      th.seenElla = Date.now(); await L.writeJSON(path(th.uid), th); return res.status(200).json(pub(th));
    }
    if (b.action === 'asend') {
      const text = L.clip(b.text, 500).trim(); if (!text) return res.status(400).json({ error: 'empty' });
      if (!th) th = { uid: b.uid, name: L.clip(b.name, 30), toks: [], msgs: [] };
      const m = { id: crypto.randomBytes(5).toString('hex'), from: 'ella', t: text, ts: Date.now() };
      th.msgs = (th.msgs || []).concat([m]).slice(-300); th.seenElla = m.ts;
      await L.writeJSON(path(th.uid), th);
      await L.vapid(); let n = 0;
      for (const s of (await L.allSubs()).filter(s => s.role === 'user' && s.uid === th.uid)) if (await L.send(s, { title: 'Te he escrito 💕', body: text, url: '/?chat' })) n++;
      return res.status(200).json(Object.assign(pub(th), { notified: n }));
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) { return res.status(500).json({ error: 'server', message: String(e && e.message || e).slice(0, 200) }); }
};
