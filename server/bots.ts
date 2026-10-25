// Joueurs automatiques : décisions de mise, de tir et de répartition des jetons.
import {
  compareFull,
  compareIds,
  evaluate,
  freshDeck,
  handKey,
  opponentDistribution,
  parseHandKey,
  type HandId,
} from '../shared/hands';
import type { ActionType } from '../shared/protocol';

export interface Personality {
  aggression: number;
  bluff: number;
}

export function randomPersonality(): Personality {
  return { aggression: 0.8 + Math.random() * 0.5, bluff: 0.03 + Math.random() * 0.09 };
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function unseenDeck(known: readonly number[]): number[] {
  const deck = freshDeck();
  for (const v of known) {
    const i = deck.indexOf(v);
    if (i >= 0) deck.splice(i, 1);
  }
  return deck;
}

/** Probabilité de gagner l'abattage sans tenir compte des tirs (Monte-Carlo). */
export function estimateEquity(hole: number[], board: number[], opponents: number, iterations = 320): number {
  if (opponents <= 0) return 1;
  const base = unseenDeck([...hole, ...board]);
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    const deck = shuffleInPlace(base.slice());
    const fullBoard = board.concat(deck.splice(0, 4 - board.length));
    const mine = evaluate([...hole, ...fullBoard]);
    let better = 0;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const oh = deck.splice(0, 2);
      const theirs = evaluate([...oh, ...fullBoard]);
      const cmp = compareFull(mine, hole, theirs, oh);
      if (cmp < 0) better++;
      else if (cmp === 0) ties++;
    }
    if (better === 0) score += 1 / (ties + 1);
  }
  return score / iterations;
}

/** Risque qu'un adversaire devine notre main, vu les seules cartes communes. */
function exposure(hole: number[], board: number[]): number {
  if (board.length < 4) return 0.08;
  const mine = evaluate([...hole, ...board]);
  const dist = opponentDistribution(board, []);
  const q = dist.get(handKey(mine)) ?? 0;
  const pocketPair = hole[0] === hole[1] && mine.cat !== 'straight' && mine.cat !== 'high';
  const usesPocket = pocketPair && (mine.key === hole[0] || mine.cat === 'twopair' || mine.cat === 'fullhouse');
  return Math.min(0.45, q * 1.4) * (usesPocket ? 0.25 : 1);
}

export interface BetContext {
  hole: number[];
  board: number[];
  opponents: number;
  pot: number;
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  maxRaise: number;
  personality: Personality;
}

export function botBet(ctx: BetContext): { type: ActionType; amount?: number } {
  const { hole, board, opponents, pot, toCall, canCheck, canRaise, maxRaise, personality } = ctx;
  const equity = estimateEquity(hole, board, opponents);
  const risk = exposure(hole, board);
  const strength = equity * Math.pow(1 - risk, opponents);
  const fair = 1 / (opponents + 1);
  const rnd = Math.random();

  const raiseSize = () => {
    const target = Math.round((pot * (0.3 + strength * 0.8) + 1) * personality.aggression * (0.7 + Math.random() * 0.6));
    return Math.max(1, Math.min(maxRaise, target));
  };

  if (canCheck) {
    if (canRaise && ((strength > fair * 1.6 && rnd < 0.7 * personality.aggression) || rnd < personality.bluff)) {
      return { type: 'raise', amount: raiseSize() };
    }
    return { type: 'check' };
  }
  const odds = toCall / (pot + toCall);
  if (strength >= odds + 0.03 || rnd < personality.bluff) {
    if (canRaise && strength > fair * 2.1 && rnd < 0.45 * personality.aggression) {
      return { type: 'raise', amount: raiseSize() };
    }
    return { type: 'call' };
  }
  return { type: 'fold' };
}

export interface SnipeContext {
  hole: number[];
  board: number[];
  opponents: number;
  taken: Set<string>;
}

/** Vise la main plus forte que la sienne la plus probable chez l'adversaire, parfois un bluff. */
export function botSnipe(ctx: SnipeContext): HandId | null {
  const { hole, board, opponents, taken } = ctx;
  if (opponents <= 0) return null;
  const mine = evaluate([...hole, ...board]);
  const dist = opponentDistribution(board, hole);
  let best: HandId | null = null;
  let bestScore = 0;
  let bluff: HandId | null = null;
  let bluffScore = 0;
  for (const [k, p] of dist) {
    if (taken.has(k)) continue;
    const id = parseHandKey(k);
    const score = 1 - Math.pow(1 - p, opponents);
    const cmp = compareIds(id, mine);
    if (cmp > 0 && score > bestScore) {
      best = id;
      bestScore = score;
    } else if (cmp < 0 && score > bluffScore) {
      bluff = id;
      bluffScore = score;
    }
  }
  if (best && bestScore >= 0.1) return best;
  if (bluff && bluffScore >= 0.2 && Math.random() < 0.25) return bluff;
  return null;
}

/** Répartition équitable du surplus, en servant d'abord les joueurs à sec. */
export function evenGift(surplus: number, recipients: { id: string; chips: number }[]): Record<string, number> {
  const alloc: Record<string, number> = {};
  if (recipients.length === 0 || surplus <= 0) return alloc;
  const sorted = [...recipients].sort((a, b) => a.chips - b.chips);
  const base = Math.floor(surplus / sorted.length);
  let rest = surplus - base * sorted.length;
  for (const r of sorted) {
    alloc[r.id] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return alloc;
}
