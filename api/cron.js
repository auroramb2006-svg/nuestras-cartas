// Recordatorios. Se llama cada hora (GitHub Actions) y una vez al día como respaldo (Vercel).
// Lee todo lo de push/ de una sola vez para gastar pocas operaciones del almacén.
const L = require('./_push_lib.js');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const madridHour = () => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date());
const H12 = 12 * 3600e3;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET && req.query && req.query.k !== process.env.CRON_SECRET) return res.status(401).json({ error: 'auth' });
  try {
    await L.vapid();
    const day = today(), now = Date.now(), hour = madridHour();
    // Algo "para un día" sin hora concreta sale a partir de las 10:00 de ese día.
    const due = r => r.at ? (r.at <= now && now - r.at < H12) : (r.day && (r.day < day || (r.day === day && hour >= 10)));
    const blobs = await L.listAll('push/');
    const subs = [], customs = [], reqs = [];
    for (const b of blobs) {
      if (b.pathname.startsWith('push/subs/')) subs.push(b); else if (b.pathname.startsWith('push/custom/')) customs.push(b); else if (b.pathname.startsWith('push/requests/')) reqs.push(b);
    }
    let sent = 0, custom = 0, his = 0;
    const loaded = [];
    for (const b of subs) { const s = await L.readJSON(b.pathname); if (s && s.sub) { s._path = b.pathname; loaded.push(s); } }
    for (const s of loaded) {
      if (s.role !== 'user') continue;
      const list = (s.reminders || []).filter(r => due(r) && !(s.sent || []).includes(r.id));
      if (!list.length) continue;
      const payload = list.length === 1 ? { title: list[0].title, body: list[0].body, url: '/' } : { title: 'Tienes ' + list.length + ' avisos ✨', body: list.map(r => r.title + ': ' + r.body).join('. ').slice(0, 220), url: '/' };
      if (await L.send(s, payload)) { sent++; s.sent = (s.sent || []).concat(list.map(r => r.id)).slice(-200); const p = s._path; delete s._path; await L.writeJSON(p, s); s._path = p; }
    }
    const { del } = require('@vercel/blob');
    const users = loaded.filter(s => s.role === 'user'), admins = loaded.filter(s => s.role === 'admin');
    for (const b of customs) {
      const c = await L.readJSON(b.pathname); if (!c || !due(c)) continue;
      for (const s of users.filter(s => c.to === 'all' || s.uid === c.to)) await L.send(s, { title: c.title, body: c.body, url: '/' }, 'high');
      custom++; try { await del(b.pathname); } catch (e) {}
    }
    for (const b of reqs) {
      const r = await L.readJSON(b.pathname); if (!r || r.sent || !due(r)) continue;
      for (const s of admins) await L.send(s, { title: r.title || (r.name + ' 👀'), body: (r.title ? r.name + ': ' : '') + (r.text || ''), url: 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html' }, 'high');
      r.sent = Date.now(); await L.writeJSON(b.pathname, r); his++;
    }
    return res.status(200).json({ ok: true, day, hour, sent, custom, his });
  } catch (e) { return res.status(500).json({ error: 'server', message: String(e && e.message || e).slice(0, 200) }); }
};
