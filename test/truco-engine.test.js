const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../api/_truco_engine');

test('la jerarquia de las cartas incluye el as y los cuatro especiales', () => {
  assert.equal(T.rank({ s: 'E', v: 1 }), 14);
  assert.equal(T.rank({ s: 'B', v: 1 }), 13);
  assert.equal(T.rank({ s: 'E', v: 7 }), 12);
  assert.equal(T.rank({ s: 'O', v: 7 }), 11);
  assert.equal(T.rank({ s: 'C', v: 3 }), 10);
});

test('el envido suma dos cartas del mismo palo', () => {
  const cards = [
    { s: 'E', v: 7 },
    { s: 'E', v: 6 },
    { s: 'C', v: 12 },
  ];
  assert.equal(T.envidoOf(cards), 33);
});

test('create y start producen una partida valida para dos jugadores', () => {
  const game = T.create({
    inviter: 'el',
    bet: [{ n: 1, name: 'Carta', r: 'c' }],
    elName: 'Juan',
    ellaName: 'Ana',
  });

  assert.equal(game.status, 'invite');
  assert.equal(game.target, 15);
  T.start(game);

  assert.equal(game.status, 'play');
  assert.equal(game.hand.cards.el.length, 3);
  assert.equal(game.hand.cards.ella.length, 3);
  assert.equal(game.hand.bazas.length, 1);
  assert.ok(['el', 'ella'].includes(game.hand.mano));
});

test('handWinner necesita dos bazas ganadas', () => {
  assert.equal(T.handWinner({
    mano: 'el',
    bazas: [
      { win: 'el' },
      { win: 'el' },
      { win: null },
    ],
  }), 'el');
});

test('el jugador invitado puede aceptar y empezar el truco', () => {
  const game = T.create({
    inviter: 'el',
    bet: [{ n: 1, name: 'Carta', r: 'c' }],
  });
  T.start(game);

  const before = T.view(game, game.hand.turn);
  assert.equal(before.status, 'play');
  assert.equal(before.opts.toAct, game.hand.turn);
});
