// Notificaciones: guardar suscripciones, mandar una de prueba y avisarla a ella al momento.
const L = require('./_push_lib.js');
const crypto = require('crypto');
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const madrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Solo el editor de ella conoce la clave: la primera vez que se usa, queda guardada (su huella) y después se exige siempre.
async function isAdmin(secret) {
  if (!secret || String(secret).length < 32) return false;
  const a = await L.readJSON('push/admin.json');
  if (!a || !a.h) { await L.writeJSON('push/admin.json', { h: sha(secret), ts: Date.now() }); return true; }
  return a.h === sha(secret);
}
async function notifyHer(r) {
  const subs = (await L.allSubs()).filter(s => s.role === 'admin'); let n = 0;
  for (const s of subs) if (await L.send(s, { title: r.title || (r.name + ' 👀'), body: (r.title ? r.name + ': ' : '') + (r.text || ''), url: 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html' })) n++;
  return n;
}
async function sendCustom(c) {
  const subs = (await L.allSubs()).filter(s => s.role === 'user' && (c.to === 'all' || s.uid === c.to));
  let n = 0; for (const s of subs) if (await L.send(s, { title: c.title, body: c.body, url: '/' })) n++;
  return { n, devices: subs.length };
}

module.exports = async (req, res) => {
  L.cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const k = await L.vapid();
    if (req.method === 'GET') return res.status(200).json({ publicKey: k.publicKey });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const b = await L.readBody(req);
    const sub = b.sub;
    const okSub = sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.keys && sub.keys.p256dh && sub.keys.auth;

    if (b.action === 'sub') {
      if (!okSub) return res.status(400).json({ error: 'bad_sub' });
      const role = b.role === 'admin' ? 'admin' : 'user';
      const reminders = (Array.isArray(b.reminders) ? b.reminders : []).slice(0, 80).map(r => ({ id: L.clip(r.id, 60), day: L.clip(r.day, 10), title: L.clip(r.title, 80), body: L.clip(r.body, 160) })).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
      const path = L.SUBS + L.subId(sub.endpoint) + '.json';
      const prev = (await L.readJSON(path)) || {};
      await L.writeJSON(path, { role, name: L.clip(b.name, 30), uid: L.clip(b.uid, 13), sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, reminders, sent: (prev.sent || []).slice(-200), ts: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'test') {
      if (!okSub) return res.status(400).json({ error: 'bad_sub' });
      const ok = await L.send({ sub }, { title: b.role === 'admin' ? 'Funciona 👀' : 'Funciona ✨', body: b.role === 'admin' ? 'Así te llegará lo que haga' : 'Así te llegarán los avisos', url: b.url || '/' });
      return res.status(ok ? 200 : 502).json({ ok });
    }
    if (b.action === 'unsub') {
      if (!okSub) return res.status(400).json({ error: 'bad_sub' });
      try { const { del } = require('@vercel/blob'); await del(L.SUBS + L.subId(sub.endpoint) + '.json'); } catch (e) {}
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'event') {
      // Aviso inmediato para ella (los móviles con el editor y los avisos activados).
      const text = L.clip(b.text, 160); if (!text) return res.status(400).json({ error: 'bad' });
      const subs = (await L.allSubs()).filter(s => s.role === 'admin');
      let n = 0; for (const s of subs) if (await L.send(s, { title: (L.clip(b.name, 30) || 'Alguien') + ' 👀', body: text, url: 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html' })) n++;
      return res.status(200).json({ ok: true, sent: n });
    }
    if (b.action === 'request') {
      // Él le manda una notificación a ella: ahora o un día concreto (sobre las 10).
      const text = L.clip(b.text, 200).trim(), title = L.clip(b.title, 80).trim();
      if (!text && !title) return res.status(400).json({ error: 'empty' });
      const r = { id: crypto.randomBytes(6).toString('hex'), name: L.clip(b.name, 30) || 'Alguien', uid: L.clip(b.uid, 13), title, text, ts: Date.now() };
      if (b.day && /^\d{4}-\d{2}-\d{2}$/.test(b.day) && b.day > madrid()) r.day = b.day;
      let n = 0;
      if (!r.day) { n = await notifyHer(r); r.sent = Date.now(); }
      await L.writeJSON('push/requests/' + r.id + '.json', r);
      return res.status(200).json({ ok: true, notified: n, scheduled: r.day || null });
    }
    if (b.action === 'reqList' || b.action === 'reqDone') {
      if (!(await isAdmin(b.secret))) return res.status(403).json({ error: 'auth' });
      const { list, del } = require('@vercel/blob');
      if (b.action === 'reqList') {
        const r = await list({ prefix: 'push/requests/', limit: 200 });
        const items = []; for (const x of r.blobs || []) { const o = await L.readJSON(x.pathname); if (o) items.push(o); }
        return res.status(200).json({ items: items.sort((a, c) => c.ts - a.ts) });
      }
      if (!/^[a-z0-9]{6,20}$/.test(String(b.id))) return res.status(400).json({ error: 'bad' });
      const r = await L.readJSON('push/requests/' + b.id + '.json');
      let n = 0;
      if (r && b.grant) { const subs = (await L.allSubs()).filter(s => s.role === 'user' && s.uid === r.uid); for (const s of subs) if (await L.send(s, { title: '¡Concedido! 💕', body: '«' + r.text + '»' + (b.note ? ' · ' + L.clip(b.note, 100) : ''), url: '/' })) n++; }
      try { await del('push/requests/' + b.id + '.json'); } catch (e) {}
      return res.status(200).json({ ok: true, notified: n });
    }
    if (b.action === 'custom' || b.action === 'customList' || b.action === 'customDel') {
      if (!(await isAdmin(b.secret))) return res.status(403).json({ error: 'auth' });
      if (b.action === 'customList') {
        const r = await require('@vercel/blob').list({ prefix: 'push/custom/', limit: 200 });
        const items = []; for (const x of r.blobs || []) { const o = await L.readJSON(x.pathname); if (o) items.push(o); }
        return res.status(200).json({ items: items.sort((a, c) => a.day < c.day ? -1 : 1) });
      }
      if (b.action === 'customDel') {
        if (!/^[a-z0-9]{6,20}$/.test(String(b.id))) return res.status(400).json({ error: 'bad' });
        try { await require('@vercel/blob').del('push/custom/' + b.id + '.json'); } catch (e) {}
        return res.status(200).json({ ok: true });
      }
      const c = { to: b.to === 'all' ? 'all' : L.clip(b.to, 13), toName: L.clip(b.toName, 30), title: L.clip(b.title, 80), body: L.clip(b.body, 200) };
      if (!c.title && !c.body) return res.status(400).json({ error: 'empty' });
      if (!c.title) c.title = 'Nuestras cartas';
      if (b.day && /^\d{4}-\d{2}-\d{2}$/.test(b.day) && b.day > madrid()) {
        c.id = crypto.randomBytes(6).toString('hex'); c.day = b.day; c.ts = Date.now();
        await L.writeJSON('push/custom/' + c.id + '.json', c);
        return res.status(200).json({ ok: true, scheduled: c.day });
      }
      const r = await sendCustom(c);
      return res.status(200).json({ ok: true, sent: r.n, devices: r.devices });
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) {
    const msg = String(e && e.message || e);
    return res.status(500).json({ error: /token|store/i.test(msg) ? 'no_store' : 'server', message: msg.slice(0, 200) });
  }
};

module.exports.sendCustom = sendCustom;
module.exports.notifyHer = notifyHer;
