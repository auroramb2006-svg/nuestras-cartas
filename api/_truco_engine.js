// Truco argentino a dos jugadores ("el" y "ella"), sin flor, a 15 puntos.
// El estado vive en el servidor; cada jugador solo ve sus cartas.
const crypto = require('crypto');

const SUITS = ['E', 'B', 'O', 'C']; // espadas, bastos, oros, copas
const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const other = w => (w === 'el' ? 'ella' : 'el');

function rank(c) {
  if (c.v === 1 && c.s === 'E') return 14;
  if (c.v === 1 && c.s === 'B') return 13;
  if (c.v === 7 && c.s === 'E') return 12;
  if (c.v === 7 && c.s === 'O') return 11;
  if (c.v === 3) return 10;
  if (c.v === 2) return 9;
  if (c.v === 1) return 8;
  if (c.v === 12) return 7;
  if (c.v === 11) return 6;
  if (c.v === 10) return 5;
  if (c.v === 7) return 4;
  return c.v - 3; // 6→3, 5→2, 4→1
}
function envidoOf(cards) {
  const pv = c => (c.v >= 10 ? 0 : c.v);
  let best = Math.max(...cards.map(pv));
  for (const s of SUITS) {
    const same = cards.filter(c => c.s === s).map(pv).sort((a, b) => b - a);
    if (same.length >= 2) best = Math.max(best, 20 + same[0] + same[1]);
  }
  return best;
}
function shuffle() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ s, v });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
const name = c => {
  const n = { 1: 'el 1', 10: 'la sota', 11: 'el caballo', 12: 'el rey' }[c.v] || 'el ' + c.v;
  return n + ' de ' + { E: 'espadas', B: 'bastos', O: 'oros', C: 'copas' }[c.s];
};
const TRUCO_NAME = { 2: 'Truco', 3: 'Retruco', 4: 'Vale cuatro' };
const ENV_NAME = { E: 'Envido', R: 'Real envido', F: 'Falta envido' };

function log(g, who, t) { g.log.push({ who, t, ts: Date.now() }); if (g.log.length > 60) g.log = g.log.slice(-60); }

function newHand(g) {
  const d = shuffle();
  const mano = g.hand ? other(g.hand.mano) : (g.firstMano || 'el');
  g.hand = {
    n: (g.hand ? g.hand.n : 0) + 1, mano,
    cards: { el: [d[0], d[2], d[4]], ella: [d[1], d[3], d[5]] },
    start: { el: [d[0], d[2], d[4]], ella: [d[1], d[3], d[5]] },
    bazas: [{ el: null, ella: null, win: null }],
    turn: mano,
    truco: { pts: 1, canRaise: null },
    envido: { done: false },
    pend: null, // {kind:'truco', who, pts, resume} | {kind:'envido', who, chain:[], resume, trucoPend}
  };
}

function create(opts) {
  const g = {
    id: crypto.randomBytes(5).toString('hex'), v: 0, status: 'invite', inviter: opts.inviter,
    names: { el: opts.elName || 'Él', ella: opts.ellaName || 'Ella' }, bets: { el: null, ella: null },
    score: { el: 0, ella: 0 }, target: 15, hand: null, log: [], winner: null, ts: Date.now(), seen: {},
  };
  g.bets[opts.inviter] = opts.bet;
  return g;
}

function start(g) {
  g.status = 'play'; g.firstMano = crypto.randomInt(2) ? 'el' : 'ella'; newHand(g);
  log(g, null, 'Empieza la partida. Es mano ' + g.names[g.hand.mano] + '.');
}

function addPoints(g, who, pts, why) {
  g.score[who] += pts;
  log(g, null, `${g.names[who]} suma ${pts} ${pts === 1 ? 'punto' : 'puntos'}${why ? ' (' + why + ')' : ''}.`);
  if (g.score[who] >= g.target) { g.score[who] = Math.min(g.score[who], g.target); g.status = 'done'; g.winner = who; log(g, null, `¡${g.names[who]} gana ${g.score[who]} a ${g.score[other(who)]}!`); return true; }
  return false;
}

function endHand(g, winner, why) {
  const h = g.hand; g.lastHand = { start: h.start, bazas: h.bazas, winner, n: h.n };
  if (addPoints(g, winner, h.truco.pts, why)) return;
  newHand(g);
  log(g, null, 'Nueva mano. Es mano ' + g.names[g.hand.mano] + '.');
}

function handWinner(h) {
  const w = h.bazas.map(b => b.win).filter(x => x);
  const won = p => w.filter(x => x === p).length;
  if (won('el') >= 2) return 'el';
  if (won('ella') >= 2) return 'ella';
  const [a, b, c] = h.bazas.map(x => x.win);
  if (a && b) {
    if (a === 'parda' && b !== 'parda') return b;
    if (a !== 'parda' && b === 'parda') return a;
  }
  if (a && b && c) {
    if (c === 'parda') return a !== 'parda' ? a : (b !== 'parda' ? b : h.mano);
    return c; // 1-1 y la tercera decide
  }
  return null;
}

// Qué puede hacer cada uno ahora mismo (lo usan los botones).
function options(g, me) {
  const o = { play: false, truco: null, envido: [], quiero: false, mazo: false, toAct: null };
  if (g.status !== 'play') return o;
  const h = g.hand, p = h.pend, b0 = h.bazas[0];
  const envidoWindow = !h.envido.done && h.bazas.length === 1 && !b0[me];
  if (p) {
    o.toAct = other(p.who);
    if (o.toAct !== me) return o;
    o.quiero = true; o.mazo = true;
    if (p.kind === 'truco') {
      if (p.pts < 4) o.truco = p.pts + 1;
      if (p.pts === 2 && envidoWindow && !p.envidoTried) o.envido = ['E', 'R', 'F'];
    } else {
      const ch = p.chain, last = ch[ch.length - 1], e = ch.filter(x => x === 'E').length;
      if (last === 'E') { if (e < 2) o.envido.push('E'); o.envido.push('R', 'F'); }
      else if (last === 'R') o.envido.push('F');
    }
    return o;
  }
  o.toAct = h.turn;
  if (h.turn !== me) return o;
  o.play = true; o.mazo = true;
  if (h.truco.pts < 4 && (h.truco.canRaise === null || h.truco.canRaise === me)) o.truco = h.truco.pts + 1;
  if (envidoWindow && h.truco.pts === 1) o.envido = ['E', 'R', 'F'];
  return o;
}

function envidoPoints(g, chain, accepted) {
  const val = x => (x === 'E' ? 2 : x === 'R' ? 3 : 0);
  const falta = () => g.target - Math.max(g.score.el, g.score.ella);
  if (accepted) return chain.includes('F') ? falta() : chain.reduce((a, x) => a + val(x), 0);
  if (chain.length === 1) return 1;
  return chain.slice(0, -1).reduce((a, x) => a + val(x), 0);
}

// Aplica una jugada. Devuelve null si va bien o un texto de error.
function act(g, me, a) {
  if (g.status !== 'play') return 'La partida no está en juego';
  const h = g.hand, o = options(g, me), p = h.pend;
  if (o.toAct !== me) return 'No te toca';
  const t = a.type;

  if (t === 'play') {
    if (!o.play) return 'Ahora no puedes tirar';
    const i = a.i | 0; const c = h.cards[me][i]; if (!c) return 'Esa carta no está';
    h.cards[me].splice(i, 1);
    const bz = h.bazas[h.bazas.length - 1]; bz[me] = c;
    log(g, me, 'Tira ' + name(c));
    if (!bz[other(me)]) { h.turn = other(me); return null; }
    const r1 = rank(bz.el), r2 = rank(bz.ella);
    bz.win = r1 > r2 ? 'el' : r2 > r1 ? 'ella' : 'parda';
    log(g, null, bz.win === 'parda' ? 'Parda.' : 'Baza para ' + g.names[bz.win] + '.');
    const w = handWinner(h);
    if (w) return endHand(g, w, h.truco.pts > 1 ? TRUCO_NAME[h.truco.pts].toLowerCase() + ' querido' : 'la mano'), null;
    h.bazas.push({ el: null, ella: null, win: null });
    h.turn = bz.win === 'parda' ? h.mano : bz.win;
    return null;
  }

  if (t === 'mazo') {
    if (!o.mazo) return 'Ahora no';
    log(g, me, 'Me voy al mazo');
    let pts = h.truco.pts;
    if (p && p.kind === 'truco') pts = h.truco.pts; // no quiso el canto pendiente
    if (p && p.kind === 'envido') { addPoints(g, other(me), envidoPoints(g, p.chain, false), 'envido no querido'); if (g.status !== 'play') return null; }
    h.truco.pts = pts;
    return endHand(g, other(me), 'se fue al mazo'), null;
  }

  if (t === 'truco') {
    if (o.truco === null) return 'No puedes cantar eso ahora';
    const pts = o.truco;
    if (p && p.kind === 'truco') { h.truco.pts = p.pts; h.truco.canRaise = me; }
    h.pend = { kind: 'truco', who: me, pts, resume: p ? p.resume : h.turn, envidoTried: p ? p.envidoTried : false };
    log(g, me, '¡' + TRUCO_NAME[pts] + '!');
    return null;
  }

  if (t === 'envido') {
    const k = a.k; if (!o.envido.includes(k)) return 'No puedes cantar eso ahora';
    if (p && p.kind === 'envido') { p.chain.push(k); p.who = me; }
    else h.pend = { kind: 'envido', who: me, chain: [k], resume: p ? p.resume : h.turn, trucoPend: p && p.kind === 'truco' ? Object.assign({}, p, { envidoTried: true }) : null };
    log(g, me, '¡' + ENV_NAME[k] + '!');
    return null;
  }

  if (t === 'quiero' || t === 'noquiero') {
    if (!p) return 'No hay nada que querer';
    const yes = t === 'quiero';
    log(g, me, yes ? 'Quiero' : 'No quiero');
    if (p.kind === 'truco') {
      h.pend = null;
      if (!yes) { h.truco.pts = p.pts - 1; return endHand(g, p.who, TRUCO_NAME[p.pts].toLowerCase() + ' no querido'), null; }
      h.truco.pts = p.pts; h.truco.canRaise = me; h.turn = p.resume; return null;
    }
    // envido
    h.envido.done = true;
    h.pend = p.trucoPend || null;
    const pts = envidoPoints(g, p.chain, yes);
    if (yes) {
      const ve = envidoOf(h.start.el), va = envidoOf(h.start.ella);
      const w = ve > va ? 'el' : va > ve ? 'ella' : h.mano;
      h.envido.result = { el: ve, ella: va, winner: w };
      log(g, null, `Envido: ${g.names.el} tiene ${ve}, ${g.names.ella} tiene ${va}.`);
      if (addPoints(g, w, pts, 'envido')) return null;
    } else if (addPoints(g, p.who, pts, 'envido no querido')) return null;
    if (!h.pend) h.turn = p.resume;
    return null;
  }
  return 'Jugada desconocida';
}

// Lo que ve cada jugador (sin las cartas del otro).
function view(g, me) {
  const out = { id: g.id, v: g.v, status: g.status, inviter: g.inviter, names: g.names, bets: g.bets, score: g.score, target: g.target, winner: g.winner, log: g.log.slice(-12), me };
  if (g.hand && g.status !== 'invite') {
    const h = g.hand;
    out.hand = { n: h.n, mano: h.mano, mine: h.cards[me], oppLeft: h.cards[other(me)].length, bazas: h.bazas, turn: h.turn, truco: h.truco.pts, envido: h.envido.done ? (h.envido.result || { done: true }) : null, pend: h.pend ? { kind: h.pend.kind, who: h.pend.who, pts: h.pend.pts, chain: h.pend.chain } : null };
    out.myEnvido = envidoOf(h.start[me]);
    out.opts = options(g, me);
  }
  if (g.lastHand) out.lastHand = { n: g.lastHand.n, winner: g.lastHand.winner, opp: g.lastHand.start[other(me)], bazas: g.lastHand.bazas };
  return out;
}

module.exports = { create, start, act, view, options, rank, envidoOf, other, handWinner };
