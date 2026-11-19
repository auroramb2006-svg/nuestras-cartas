// Notificaciones: guardar suscripciones, mandar una de prueba y avisarla a ella al momento.
const L = require('./_push_lib.js');

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
      const ok = await L.send({ sub }, { title: b.role === 'admin' ? '🔔 Avisos del editor activados' : '💌 ¡Notificaciones activadas!', body: b.role === 'admin' ? 'Así te llegará cuando alguien agende, canjee o abra un sobre.' : 'Así te avisaré de tus planes y de las cartas que caducan.', url: b.url || '/' });
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
      let n = 0; for (const s of subs) if (await L.send(s, { title: '👀 ' + (L.clip(b.name, 30) || 'Alguien'), body: text, url: 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html' })) n++;
      return res.status(200).json({ ok: true, sent: n });
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) {
    const msg = String(e && e.message || e);
    return res.status(500).json({ error: /token|store/i.test(msg) ? 'no_store' : 'server', message: msg.slice(0, 200) });
  }
};
