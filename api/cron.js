// Se ejecuta una vez al día (10:00 en España): manda los recordatorios que tocan hoy.
const L = require('./_push_lib.js');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'auth' });
  try {
    await L.vapid();
    const day = today(); let sent = 0;
    for (const s of await L.allSubs()) {
      if (s.role !== 'user') continue;
      const due = (s.reminders || []).filter(r => r.day === day && !(s.sent || []).includes(r.id));
      if (!due.length) continue;
      const payload = due.length === 1 ? { title: due[0].title, body: due[0].body, url: '/' } : { title: '💌 Tienes ' + due.length + ' avisos hoy', body: due.map(r => r.title.replace(/^\S+\s/, '') + ': ' + r.body).join(' · ').slice(0, 220), url: '/' };
      if (await L.send(s, payload)) { sent++; s.sent = (s.sent || []).concat(due.map(r => r.id)).slice(-200); const p = s._path; delete s._path; await L.writeJSON(p, s); }
    }
    return res.status(200).json({ ok: true, day, sent });
  } catch (e) { return res.status(500).json({ error: 'server', message: String(e && e.message || e).slice(0, 200) }); }
};
