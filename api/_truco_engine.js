// Motor puro del truco argentino: dos jugadores, sin flor, a 15 puntos.
// Este modulo nunca habla con HTTP ni con el almacenamiento.

const crypto = require('crypto');

const SUITS = Object.freeze(['E', 'B', 'O', 'C']);
const VALUES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
const TARGET = 15;

const TRUCO_NAMES = Object.freeze({
  2: 'Truco',
  3: 'Retruco',
  4: 'Vale cuatro',
});

const ENVIDO_NAMES = Object.freeze({
  E: 'Envido',
  R: 'Real envido',
  F: 'Falta envido',
});

function other(who) {
  return who === 'el' ? 'ella' : 'el';
}

function rank(card) {
  if (card.v === 1 && card.s === 'E') return 14;
  if (card.v === 1 && card.s === 'B') return 13;
  if (card.v === 7 && card.s === 'E') return 12;
  if (card.v === 7 && card.s === 'O') return 11;
  if (card.v === 3) return 10;
  if (card.v === 2) return 9;
  if (card.v === 1) return 8;
  if (card.v === 12) return 7;
  if (card.v === 11) return 6;
  if (card.v === 10) return 5;
  if (card.v === 7) return 4;
  return card.v - 3;
}

function envidoOf(cards) {
  const paintedValue = card => (card.v >= 10 ? 0 : card.v);
  let best = Math.max(...cards.map(paintedValue));

  for (const suit of SUITS) {
    const sameSuit = cards
      .filter(card => card.s === suit)
      .map(paintedValue)
      .sort((a, b) => b - a);

    if (sameSuit.length >= 2) {
      best = Math.max(best, 20 + sameSuit[0] + sameSuit[1]);
    }
  }

  return best;
}

function shuffleDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ s: suit, v: value });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function cardName(card) {
  const numberNames = {
    1: 'el 1',
    10: 'la sota',
    11: 'el caballo',
    12: 'el rey',
  };
  const suitNames = {
    E: 'espadas',
    B: 'bastos',
    O: 'oros',
    C: 'copas',
  };
  const number = numberNames[card.v] || `el ${card.v}`;
  return `${number} de ${suitNames[card.s]}`;
}

function addLog(game, who, text) {
  game.log.push({ who, t: text, ts: Date.now() });
  if (game.log.length > 60) game.log = game.log.slice(-60);
}

function newHand(game) {
  const deck = shuffleDeck();
  const mano = game.hand ? other(game.hand.mano) : (game.firstMano || 'el');

  game.hand = {
    n: (game.hand ? game.hand.n : 0) + 1,
    mano,
    cards: {
      el: [deck[0], deck[2], deck[4]],
      ella: [deck[1], deck[3], deck[5]],
    },
    start: {
      el: [deck[0], deck[2], deck[4]],
      ella: [deck[1], deck[3], deck[5]],
    },
    bazas: [{ el: null, ella: null, win: null }],
    turn: mano,
    truco: { pts: 1, canRaise: null },
    envido: { done: false },
    pend: null,
  };
}

function create(options) {
  const game = {
    id: crypto.randomBytes(5).toString('hex'),
    v: 0,
    status: 'invite',
    inviter: options.inviter,
    names: {
      el: options.elName || 'El',
      ella: options.ellaName || 'Ella',
    },
    bets: { el: null, ella: null },
    score: { el: 0, ella: 0 },
    target: TARGET,
    hand: null,
    log: [],
    winner: null,
    ts: Date.now(),
    seen: {},
  };
  game.bets[options.inviter] = options.bet;
  return game;
}

function start(game) {
  game.status = 'play';
  game.firstMano = crypto.randomInt(2) ? 'el' : 'ella';
  newHand(game);
  addLog(game, null, `Empieza la partida. Es mano ${game.names[game.hand.mano]}.`);
}

function addPoints(game, who, points, reason) {
  game.score[who] += points;
  const unit = points === 1 ? 'punto' : 'puntos';
  const reasonText = reason ? ` (${reason})` : '';
  addLog(game, null, `${game.names[who]} suma ${points} ${unit}${reasonText}.`);

  if (game.score[who] >= game.target) {
    game.score[who] = Math.min(game.score[who], game.target);
    game.status = 'done';
    game.winner = who;
    addLog(game, null, `¡${game.names[who]} gana ${game.score[who]} a ${game.score[other(who)]}!`);
    return true;
  }
  return false;
}

function endHand(game, winner, reason) {
  const hand = game.hand;
  game.lastHand = {
    start: hand.start,
    bazas: hand.bazas,
    winner,
    n: hand.n,
  };

  if (addPoints(game, winner, hand.truco.pts, reason)) return;
  newHand(game);
  addLog(game, null, `Nueva mano. Es mano ${game.names[game.hand.mano]}.`);
}

function handWinner(hand) {
  const wins = hand.bazas.map(baza => baza.win).filter(Boolean);
  const countWins = player => wins.filter(winner => winner === player).length;

  if (countWins('el') >= 2) return 'el';
  if (countWins('ella') >= 2) return 'ella';

  const [first, second, third] = hand.bazas.map(baza => baza.win);

  if (first && second) {
    if (first === 'parda' && second !== 'parda') return second;
    if (first !== 'parda' && second === 'parda') return first;
  }

  if (first && second && third) {
    if (third === 'parda') {
      return first !== 'parda' ? first : (second !== 'parda' ? second : hand.mano);
    }
    return third;
  }

  return null;
}

function options(game, me) {
  const available = {
    play: false,
    truco: null,
    envido: [],
    quiero: false,
    mazo: false,
    toAct: null,
  };
  if (game.status !== 'play') return available;

  const hand = game.hand;
  const pending = hand.pend;
  const firstBaza = hand.bazas[0];
  const envidoWindow = !hand.envido.done
    && hand.bazas.length === 1
    && !firstBaza[me];

  if (pending) {
    available.toAct = other(pending.who);
    if (available.toAct !== me) return available;

    available.quiero = true;
    available.mazo = true;

    if (pending.kind === 'truco') {
      if (pending.pts < 4) available.truco = pending.pts + 1;
      if (pending.pts === 2 && envidoWindow && !pending.envidoTried) {
        available.envido = ['E', 'R', 'F'];
      }
    } else {
      const chain = pending.chain;
      const last = chain[chain.length - 1];
      const envidoCount = chain.filter(value => value === 'E').length;

      if (last === 'E') {
        if (envidoCount < 2) available.envido.push('E');
        available.envido.push('R', 'F');
      } else if (last === 'R') {
        available.envido.push('F');
      }
    }
    return available;
  }

  available.toAct = hand.turn;
  if (hand.turn !== me) return available;

  available.play = true;
  available.mazo = true;

  if (
    hand.truco.pts < 4
    && (hand.truco.canRaise === null || hand.truco.canRaise === me)
  ) {
    available.truco = hand.truco.pts + 1;
  }
  if (envidoWindow && hand.truco.pts === 1) {
    available.envido = ['E', 'R', 'F'];
  }
  return available;
}

function envidoPoints(game, chain, accepted) {
  const value = chant => (chant === 'E' ? 2 : chant === 'R' ? 3 : 0);
  const falta = () => game.target - Math.max(game.score.el, game.score.ella);

  if (accepted) {
    return chain.includes('F')
      ? falta()
      : chain.reduce((total, chant) => total + value(chant), 0);
  }
  if (chain.length === 1) return 1;
  return chain.slice(0, -1).reduce((total, chant) => total + value(chant), 0);
}

function act(game, me, action) {
  if (game.status !== 'play') return 'La partida no esta en juego';

  const hand = game.hand;
  const available = options(game, me);
  const pending = hand.pend;
  const type = action.type;

  if (available.toAct !== me) return 'No te toca';

  if (type === 'play') {
    if (!available.play) return 'Ahora no puedes tirar';

    const index = action.i | 0;
    const card = hand.cards[me][index];
    if (!card) return 'Esa carta no esta';

    hand.cards[me].splice(index, 1);
    const baza = hand.bazas[hand.bazas.length - 1];
    baza[me] = card;
    addLog(game, me, 'Tira ' + cardName(card));

    if (!baza[other(me)]) {
      hand.turn = other(me);
      return null;
    }

    const elRank = rank(baza.el);
    const ellaRank = rank(baza.ella);
    baza.win = elRank > ellaRank ? 'el'
      : ellaRank > elRank ? 'ella'
      : 'parda';
    addLog(
      game,
      null,
      baza.win === 'parda' ? 'Parda.' : 'Baza para ' + game.names[baza.win] + '.',
    );

    const winner = handWinner(hand);
    if (winner) {
      const reason = hand.truco.pts > 1
        ? `${TRUCO_NAMES[hand.truco.pts].toLowerCase()} querido`
        : 'la mano';
      endHand(game, winner, reason);
      return null;
    }

    hand.bazas.push({ el: null, ella: null, win: null });
    hand.turn = baza.win === 'parda' ? hand.mano : baza.win;
    return null;
  }

  if (type === 'mazo') {
    if (!available.mazo) return 'Ahora no';

    addLog(game, me, 'Me voy al mazo');
    let points = hand.truco.pts;

    if (pending && pending.kind === 'truco') {
      points = hand.truco.pts;
    }
    if (pending && pending.kind === 'envido') {
      addPoints(
        game,
        other(me),
        envidoPoints(game, pending.chain, false),
        'envido no querido',
      );
      if (game.status !== 'play') return null;
    }

    hand.truco.pts = points;
    endHand(game, other(me), 'se fue al mazo');
    return null;
  }

  if (type === 'truco') {
    if (available.truco === null) return 'No puedes cantar eso ahora';

    const points = available.truco;
    if (pending && pending.kind === 'truco') {
      hand.truco.pts = pending.pts;
      hand.truco.canRaise = me;
    }
    hand.pend = {
      kind: 'truco',
      who: me,
      pts: points,
      resume: pending ? pending.resume : hand.turn,
      envidoTried: pending ? pending.envidoTried : false,
    };
    addLog(game, me, '¡' + TRUCO_NAMES[points] + '!');
    return null;
  }

  if (type === 'envido') {
    const chant = action.k;
    if (!available.envido.includes(chant)) {
      return 'No puedes cantar eso ahora';
    }

    if (pending && pending.kind === 'envido') {
      pending.chain.push(chant);
      pending.who = me;
    } else {
      hand.pend = {
        kind: 'envido',
        who: me,
        chain: [chant],
        resume: pending ? pending.resume : hand.turn,
        trucoPend: pending && pending.kind === 'truco'
          ? { ...pending, envidoTried: true }
          : null,
      };
    }
    addLog(game, me, '¡' + ENVIDO_NAMES[chant] + '!');
    return null;
  }

  if (type === 'quiero' || type === 'noquiero') {
    if (!pending) return 'No hay nada que querer';

    const accepted = type === 'quiero';
    addLog(game, me, accepted ? 'Quiero' : 'No quiero');

    if (pending.kind === 'truco') {
      hand.pend = null;
      if (!accepted) {
        hand.truco.pts = pending.pts - 1;
        endHand(
          game,
          pending.who,
          `${TRUCO_NAMES[pending.pts].toLowerCase()} no querido`,
        );
        return null;
      }
      hand.truco.pts = pending.pts;
      hand.truco.canRaise = me;
      hand.turn = pending.resume;
      return null;
    }

    hand.envido.done = true;
    hand.pend = pending.trucoPend || null;
    const points = envidoPoints(game, pending.chain, accepted);

    if (accepted) {
      const elEnvido = envidoOf(hand.start.el);
      const ellaEnvido = envidoOf(hand.start.ella);
      const winner = elEnvido > ellaEnvido
        ? 'el'
        : ellaEnvido > elEnvido
          ? 'ella'
          : hand.mano;

      hand.envido.result = {
        el: elEnvido,
        ella: ellaEnvido,
        winner,
      };
      addLog(
        game,
        null,
        `Envido: ${game.names.el} tiene ${elEnvido}, ${game.names.ella} tiene ${ellaEnvido}.`,
      );
      if (addPoints(game, winner, points, 'envido')) return null;
    } else if (addPoints(game, pending.who, points, 'envido no querido')) {
      return null;
    }

    if (!hand.pend) hand.turn = pending.resume;
    return null;
  }

  return 'Jugada desconocida';
}

function view(game, me) {
  const out = {
    id: game.id,
    v: game.v,
    status: game.status,
    inviter: game.inviter,
    names: game.names,
    bets: game.bets,
    score: game.score,
    target: game.target,
    winner: game.winner,
    log: game.log.slice(-12),
    me,
  };

  if (game.hand && game.status !== 'invite') {
    const hand = game.hand;
    out.hand = {
      n: hand.n,
      mano: hand.mano,
      mine: hand.cards[me],
      oppLeft: hand.cards[other(me)].length,
      bazas: hand.bazas,
      turn: hand.turn,
      truco: hand.truco.pts,
      envido: hand.envido.done
        ? (hand.envido.result || { done: true })
        : null,
      pend: hand.pend
        ? {
            kind: hand.pend.kind,
            who: hand.pend.who,
            pts: hand.pend.pts,
            chain: hand.pend.chain,
          }
        : null,
    };
    out.myEnvido = envidoOf(hand.start[me]);
    out.opts = options(game, me);
  }

  if (game.lastHand) {
    out.lastHand = {
      n: game.lastHand.n,
      winner: game.lastHand.winner,
      opp: game.lastHand.start[other(me)],
      bazas: game.lastHand.bazas,
    };
  }

  return out;
}

module.exports = {
  create,
  start,
  act,
  view,
  options,
  rank,
  envidoOf,
  other,
  handWinner,
};
