// Partidas de truco en vivo entre él (app) y ella (editor), con apuesta de una carta cada uno.
const L = require('./_push_lib.js');
const T = require('./_truco_engine.js');
const crypto = require('crypto');
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const EDITOR = 'https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html';
const okUid = u => /^[a-z0-9]{1,13}$/.test(String(u || ''));

// Almacén: Redis (Upstash, si está conectado en Vercel) o, si no, el Blob de siempre.
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
const kv = {
  async get(k) { if (RURL && RTOK) { const v = await redis(['GET', 'nc:' + k]); return v ? JSON.parse(v) : null; } return L.readJSON('truco/' + k + '.json'); },
  async set(k, v) { if (RURL && RTOK) return redis(['SET', 'nc:' + k, JSON.stringify(v)]); return L.writeJSON('truco/' + k + '.json', v); },
};

const MEMO = { admin: null, toks: {} }; // se queda en memoria mientras la función está caliente
async function isAdmin(secret) {
  if (!secret || String(secret).length < 32) return false;
  if (MEMO.admin && MEMO.admin === sha(secret)) return true;
  const a = await L.readJSON('push/admin.json'); if (a && a.h) MEMO.admin = a.h;
  if (!a || !a.h) { await L.writeJSON('push/admin.json', { h: sha(secret), ts: Date.now() }); return true; }
  return a.h === sha(secret);
}
// Él se identifica con un token que guarda su móvil (hasta 3 móviles por persona).
async function isHim(uid, tok) {
  if (!okUid(uid) || !tok || String(tok).length < 20) return false;
  const h = sha(tok); if ((MEMO.toks[uid] || []).includes(h)) return true;
  const k = uid + '-toks'; const toks = (await kv.get(k)) || []; MEMO.toks[uid] = toks;
  if (toks.includes(h)) return true;
  if (toks.length >= 3) return false;
  toks.push(h); await kv.set(k, toks); return true;
}
const cleanCard = c => c && { n: +c.n || 0, name: L.clip(c.name, 60), efecto: L.clip(c.efecto, 300), r: L.clip(c.r, 2), type: L.clip(c.type, 20) };

async function notify(role, uid, title, body) {
  try {
    await L.vapid();
    const subs = (await L.allSubs()).filter(s => role === 'ella' ? s.role === 'admin' : s.role === 'user' && s.uid === uid);
    for (const s of subs) await L.send(s, { title, body, url: role === 'ella' ? EDITOR : '/?truco' }, 'high');
  } catch (e) { /* sin avisos no pasa nada */ }
}
// Si el otro no está mirando la partida, le avisamos de que le toca (como mucho una vez por minuto).
async function nudge(g, uid, who) {
  const seen = (g.seen || {})[who] || 0, last = (g.nudged || {})[who] || 0;
  if (Date.now() - seen < 15000 || Date.now() - last < 60000) return;
  g.nudged = Object.assign({}, g.nudged, { [who]: Date.now() });
  await notify(who, uid, 'Te toca 👀', 'En el truco, ' + g.names[T.other(who)] + ' está esperando');
}

async function finish(g, uid) {
  const led = (await kv.get(uid + '-ledger')) || { prizes: [], debts: [] };
  if (g.winner === 'el') { led.prizes.push({ id: g.id, card: g.bets.ella, ts: Date.now(), used: 0 }); }
  else { led.debts.push({ id: g.id, card: g.bets.el, ts: Date.now(), paid: 0 }); }
  led.history = (led.history || []).concat([{ id: g.id, winner: g.winner, score: g.score, ts: Date.now(), bets: g.bets }]).slice(-50);
  await kv.set(uid + '-ledger', led);
  const sc = g.score.el + ' a ' + g.score.ella;
  if (g.winner === 'el') { await notify('ella', uid, g.names.el + ' te ha ganado al truco 🙄', sc + '. Se lleva «' + g.bets.ella.name + '»'); }
  else { await notify('el', uid, 'Te he ganado al truco 😏', (g.score.ella + ' a ' + g.score.el) + '. Me debes «' + g.bets.el.name + '»'); }
}

module.exports = async (req, res) => {
  L.cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const b = await L.readBody(req);
    const uid = String(b.uid || '');
    let who;
    if (b.secret) { if (!(await isAdmin(b.secret))) return res.status(403).json({ error: 'auth' }); who = 'ella'; }
    else { if (!(await isHim(uid, b.tok))) return res.status(403).json({ error: 'auth' }); who = 'el'; }
    if (!okUid(uid)) return res.status(400).json({ error: 'bad' });
    const gk = uid + '-game';
    let g = await kv.get(gk);
    const out = async () => {
      // Durante la partida no hace falta leer premios y deudas (ahorra lecturas).
      const led = g && g.status === 'play' && b.action !== 'act' ? { prizes: [], debts: [] } : ((await kv.get(uid + '-ledger')) || { prizes: [], debts: [] });
      return res.status(200).json({ game: g ? T.view(g, who) : null, ledger: { prizes: led.prizes || [], debts: led.debts || [], history: (led.history || []).slice(-10) }, redis: !!(RURL && RTOK) });
    };

    if (b.action === 'state') {
      if (g && g.status !== 'done') { g.seen = Object.assign({}, g.seen, { [who]: Date.now() }); if (!g._sw || Date.now() - g._sw > 10000) { g._sw = Date.now(); await kv.set(gk, g); } }
      return out();
    }
    if (b.action === 'challenge') {
      if (g && (g.status === 'play' || g.status === 'invite')) return res.status(409).json({ error: 'busy' });
      const bet = cleanCard(b.bet); if (!bet || !bet.name) return res.status(400).json({ error: 'bet' });
      g = T.create({ inviter: who, bet, elName: who === 'el' ? L.clip(b.name, 30) : L.clip(b.otherName, 30), ellaName: 'Ella' });
      if (who === 'ella' && b.otherName) g.names.el = L.clip(b.otherName, 30);
      if (who === 'el') g.names.el = L.clip(b.name, 30) || 'Él';
      g.seen = { [who]: Date.now() };
      await kv.set(gk, g);
      await notify(T.other(who), uid, (who === 'el' ? g.names.el : 'Te reto') + (who === 'el' ? ' te reta al truco 👀' : ' al truco 😏'), 'Apuesta «' + bet.name + '». ¿Qué te juegas tú?');
      return out();
    }
    if (!g) return res.status(404).json({ error: 'nogame' });
    if (b.action === 'accept') {
      if (g.status !== 'invite' || g.inviter === who) return res.status(409).json({ error: 'state' });
      const bet = cleanCard(b.bet); if (!bet || !bet.name) return res.status(400).json({ error: 'bet' });
      g.bets[who] = bet; T.start(g); g.v++; g.seen = Object.assign({}, g.seen, { [who]: Date.now() });
      await kv.set(gk, g);
      await notify(T.other(who), uid, '¡Ha aceptado el truco! 🧉', 'Se juega «' + bet.name + '». ' + (g.hand.mano === T.other(who) ? 'Eres mano' : 'Es mano ' + g.names[who]));
      return out();
    }
    if (b.action === 'decline' || b.action === 'cancel') {
      if (g.status === 'invite') { g.status = 'declined'; g.v++; await kv.set(gk, g); if (b.action === 'decline') await notify(T.other(who), uid, 'Ahora no le apetece el truco 🫠', 'Otra vez será'); }
      else if (g.status === 'play' && b.action === 'cancel') {
        // abandonar = perder la partida
        g.status = 'done'; g.winner = T.other(who); g.v++; g.log.push({ who, t: 'Abandona la partida', ts: Date.now() });
        await kv.set(gk, g); await finish(g, uid);
      }
      return out();
    }
    if (b.action === 'act') {
      if (typeof b.v === 'number' && b.v !== g.v) return res.status(409).json({ error: 'stale', game: T.view(g, who) });
      const err = T.act(g, who, b.move || {});
      if (err) return res.status(400).json({ error: 'move', message: err, game: T.view(g, who) });
      g.v++; g.seen = Object.assign({}, g.seen, { [who]: Date.now() });
      if (g.status === 'done') { await kv.set(gk, g); await finish(g, uid); }
      else { const nxt = T.options(g, who).toAct; if (nxt && nxt !== who) await nudge(g, uid, nxt); await kv.set(gk, g); }
      return out();
    }
    if (b.action === 'useprize' && who === 'el') {
      const led = (await kv.get(uid + '-ledger')) || { prizes: [], debts: [] };
      const p = (led.prizes || []).find(x => x.id === b.id && !x.used); if (!p) return res.status(404).json({ error: 'no' });
      p.used = Date.now(); await kv.set(uid + '-ledger', led);
      await notify('ella', uid, g.names.el + ' canjea su premio del truco 👀', '«' + p.card.name + '»');
      return out();
    }
    if (b.action === 'paydebt' && who === 'ella') {
      const led = (await kv.get(uid + '-ledger')) || { prizes: [], debts: [] };
      const d = (led.debts || []).find(x => x.id === b.id && !x.paid); if (!d) return res.status(404).json({ error: 'no' });
      d.paid = Date.now(); await kv.set(uid + '-ledger', led);
      await notify('el', uid, 'Deuda saldada 💕', '«' + d.card.name + '» ya está pagada');
      return out();
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) { return res.status(500).json({ error: 'server', message: String(e && e.message || e).slice(0, 200) }); }
};
