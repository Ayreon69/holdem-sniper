import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../server/room';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Internals = { hand: any; interlude: any; survivedCount: number };

function setup(bots: number, preset: 'express' | 'standard' | 'show' = 'express') {
  const room = new Room('TEST');
  const host = room.addHuman('Hôte', '😈');
  if (typeof host === 'string') throw new Error(host);
  room.updateSettings(host.id, { preset });
  for (let i = 0; i < bots; i++) room.addBot(host.id);
  return { room, host };
}

function rig(room: Room, holes: number[][], board: number[]) {
  const h = (room as unknown as Internals).hand;
  h.order.forEach((id: string, i: number) => h.hole.set(id, holes[i]));
  h.board = board;
  return h;
}

/** Fait checker tout le monde jusqu'à la phase de tir. */
function checkAround(room: Room) {
  const h = (room as unknown as Internals).hand;
  let guard = 0;
  while (h.street.startsWith('bet') && guard++ < 50) {
    expect(room.act(h.turnId, { type: 'check' })).toBeUndefined();
  }
  expect(h.street).toBe('snipe');
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('déroulé d’une manche', () => {
  it('abat la main visée et donne le pot à la meilleure main restante', () => {
    const { room, host } = setup(2);
    expect(room.start(host.id)).toBeUndefined();
    rig(room, [[9, 9], [6, 8], [1, 2]], [4, 7, 5, 10]);
    const h = checkAround(room);
    const [a, b, c] = h.order;
    const before = room.players.map((p) => p.chips);
    expect(room.snipe(a, { cat: 'straight', key: 8 })).toBeUndefined();
    expect(room.snipe(b, { pass: true })).toBeUndefined();
    expect(room.snipe(c, { cat: 'straight', key: 8 })).toBe('Cette combinaison est déjà visée.');
    expect(room.snipe(c, { pass: true })).toBeUndefined();
    expect(h.street).toBe('result');
    expect(h.result.winners).toEqual([a]);
    expect(h.result.entries.find((e: any) => e.id === b).sniped).toBe(true);
    expect(h.result.pot).toBe(3);
    const winner = room.get(a)!;
    expect(winner.chips).toBe(before[room.players.indexOf(winner)] + 3);
  });

  it('partage le pot quand toutes les mains sont abattues', () => {
    const { room, host } = setup(1);
    room.start(host.id);
    rig(room, [[9, 9], [6, 8]], [4, 7, 5, 10]);
    const h = checkAround(room);
    const [a, b] = h.order;
    room.snipe(a, { cat: 'pair', key: 9 });
    room.snipe(b, { cat: 'straight', key: 8 });
    expect(h.result.allSniped).toBe(true);
    expect(h.result.gains).toEqual({ [a]: 1, [b]: 1 });
  });

  it('départage par la plus haute carte privée puis la seconde', () => {
    const { room, host } = setup(1);
    room.start(host.id);
    rig(room, [[10, 1], [2, 10]], [7, 7, 3, 4]);
    const h = checkAround(room);
    const [a, b] = h.order;
    room.snipe(a, { pass: true });
    room.snipe(b, { pass: true });
    expect(h.result.winners).toEqual([b]);
  });

  it('distribue le jeton restant d’un partage dans l’ordre de parole', () => {
    const { room, host } = setup(2);
    room.start(host.id);
    rig(room, [[1, 2], [1, 2], [3, 3]], [9, 9, 9, 9]);
    const h = (room as unknown as Internals).hand;
    const [a, b, c] = h.order;
    expect(room.act(a, { type: 'raise', amount: 1 })).toBeUndefined();
    expect(room.act(b, { type: 'call' })).toBeUndefined();
    expect(room.act(c, { type: 'fold' })).toBeUndefined();
    while (h.street.startsWith('bet')) room.act(h.turnId, { type: 'check' });
    room.snipe(a, { pass: true });
    room.snipe(b, { pass: true });
    // Carré de 9 partout, mêmes cartes privées : pot de 5 → 3 pour le premier à parler, 2 pour l'autre.
    expect(h.result.gains).toEqual({ [a]: 3, [b]: 2 });
  });

  it('limite les mises au tapis du joueur le plus pauvre', () => {
    const { room, host } = setup(2);
    room.start(host.id);
    const h = (room as unknown as Internals).hand;
    const [a, b, c] = h.order;
    h.startStack.set(c, 4);
    expect(room.act(a, { type: 'raise', amount: 4 })).toBe('Relance entre 1 et 3.');
    expect(room.act(a, { type: 'raise', amount: 3 })).toBeUndefined();
    expect(room.act(b, { type: 'call' })).toBeUndefined();
    expect(room.act(c, { type: 'fold' })).toBeUndefined();
  });

  it('fait gagner celui qui reste quand tout le monde se couche', () => {
    const { room, host } = setup(2);
    room.start(host.id);
    const h = (room as unknown as Internals).hand;
    const [a, b, c] = h.order;
    room.act(a, { type: 'raise', amount: 2 });
    room.act(b, { type: 'fold' });
    room.act(c, { type: 'fold' });
    expect(h.result.kind).toBe('fold');
    expect(h.result.gains).toEqual({ [a]: 5 });
  });

  it('ne limite pas le temps de réflexion d’un joueur connecté', () => {
    const { room, host } = setup(1);
    host.sockets.add('s1');
    host.connected = true;
    room.start(host.id);
    room.commit();
    const h = (room as unknown as Internals).hand;
    let guard = 0;
    while (h.turnId !== host.id && guard++ < 50) vi.advanceTimersByTime(3_000);
    expect(h.turnId).toBe(host.id);
    vi.advanceTimersByTime(60 * 60_000);
    expect(h.turnId).toBe(host.id);
    expect(room.isAuto(host)).toBe(false);
  });

  it('impose au moins 1 jeton aux joueurs à sec lors du don', () => {
    const { room, host } = setup(2);
    room.start(host.id);
    const [x, y, z] = room.players;
    const internals = room as unknown as Internals;
    x.status = 'survived';
    y.chips = 0;
    z.chips = 30;
    internals.interlude = { playerId: x.id, surplus: 4, needsGift: true, endsAt: Date.now() + 1000, botActAt: 0, rank: 1 };
    expect(room.gift(x.id, { [z.id]: 4 })).toBe('Chaque joueur à 0 jeton doit recevoir au moins 1 jeton.');
    expect(room.gift(x.id, { [z.id]: 2, [y.id]: 1 })).toMatch(/exactement/);
    expect(room.gift(x.id, { [z.id]: 3, [y.id]: 1 })).toBeUndefined();
    expect(y.chips).toBe(1);
    expect(z.chips).toBe(33);
  });
});

describe('parties complètes entre bots', () => {
  for (const [players, preset] of [
    [2, 'express'],
    [3, 'express'],
    [5, 'express'],
    [5, 'show'],
    [8, 'express'],
  ] as const) {
    it(`${players} joueurs (${preset}) : la partie se termine avec exactement un éliminé`, () => {
      const { room: r, host } = setup(players - 1, preset);
      r.start(host.id);
      r.leave(host.id); // une fois la partie lancée, l'hôte passe en pilote automatique
      r.commit();
      const internals = r as unknown as Internals;
      const total = players * r.plan.start;
      let steps = 0;
      while (r.phase === 'playing' && steps++ < 200_000) {
        vi.advanceTimersByTime(4000);
        const h = internals.hand;
        const inPot = h && h.street !== 'result' ? [...h.committed.values()].reduce((s: number, v: number) => s + v, 0) : 0;
        const chips = r.players.reduce((s, p) => s + p.chips, 0);
        expect(chips + inPot + internals.survivedCount * r.plan.target).toBe(total);
        for (const p of r.players) expect(p.chips).toBeGreaterThanOrEqual(0);
      }
      expect(r.phase).toBe('finished');
      expect(r.final!.filter((f) => f.eliminated)).toHaveLength(1);
      expect(r.final!.filter((f) => !f.eliminated)).toHaveLength(players - 1);
    });
  }
});
