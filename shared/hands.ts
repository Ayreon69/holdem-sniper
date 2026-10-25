// Combinaisons de Hold'em Sniper : 40 cartes (4 × 1 à 10), sans couleurs.
// Une main = meilleure combinaison parmi 2 cartes privées + 4 cartes communes.

export const CATEGORIES = ['quads', 'fullhouse', 'straight', 'trips', 'twopair', 'pair', 'high'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Rang de force : plus c'est haut, plus la combinaison est forte. */
export const CAT_RANK: Record<Category, number> = {
  high: 0,
  pair: 1,
  twopair: 2,
  trips: 3,
  straight: 4,
  fullhouse: 5,
  quads: 6,
};

export const CAT_LABEL: Record<Category, string> = {
  quads: 'Carré',
  fullhouse: 'Full',
  straight: 'Suite',
  trips: 'Brelan',
  twopair: 'Double paire',
  pair: 'Paire',
  high: 'Carte haute',
};

/** Identité d'une main : c'est exactement ce qu'on annonce lors d'un tir. */
export interface HandId {
  cat: Category;
  key: number;
}

export const DECK_COPIES = 4;
export const MAX_VALUE = 10;

export function handName(h: HandId): string {
  const k = h.key;
  switch (h.cat) {
    case 'quads':
      return `Carré de ${k}`;
    case 'fullhouse':
      return `Full aux ${k}`;
    case 'straight':
      return `Suite au ${k}`;
    case 'trips':
      return `Brelan de ${k}`;
    case 'twopair':
      return `Double paire aux ${k}`;
    case 'pair':
      return `Paire de ${k}`;
    case 'high':
      return `Carte haute ${k}`;
  }
}

export function handKey(h: HandId): string {
  return `${h.cat}:${h.key}`;
}

export function sameHand(a: HandId, b: HandId): boolean {
  return a.cat === b.cat && a.key === b.key;
}

/** Plage de chiffres annonçables pour une catégorie. */
export function keyRange(cat: Category): [number, number] {
  if (cat === 'straight') return [5, MAX_VALUE];
  if (cat === 'twopair') return [2, MAX_VALUE];
  return [1, MAX_VALUE];
}

export function isValidHandId(cat: unknown, key: unknown): cat is Category {
  if (typeof cat !== 'string' || !(CATEGORIES as readonly string[]).includes(cat)) return false;
  if (typeof key !== 'number' || !Number.isInteger(key)) return false;
  const [lo, hi] = keyRange(cat as Category);
  return key >= lo && key <= hi;
}

/** Évalue la meilleure combinaison d'un ensemble de cartes (fonctionne aussi avec un tableau partiel). */
export function evaluate(cards: readonly number[]): HandId {
  const c = new Array<number>(MAX_VALUE + 1).fill(0);
  for (const v of cards) c[v]++;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let v = MAX_VALUE; v >= 1; v--) {
    if (c[v] >= 4) return { cat: 'quads', key: v };
  }
  for (let v = MAX_VALUE; v >= 1; v--) {
    if (c[v] >= 3) trips.push(v);
    if (c[v] >= 2) pairs.push(v);
  }
  if (trips.length > 0 && pairs.some((p) => p !== trips[0])) return { cat: 'fullhouse', key: trips[0] };
  for (let top = MAX_VALUE; top >= 5; top--) {
    let run = true;
    for (let v = top - 4; v <= top; v++) {
      if (c[v] === 0) {
        run = false;
        break;
      }
    }
    if (run) return { cat: 'straight', key: top };
  }
  if (trips.length > 0) return { cat: 'trips', key: trips[0] };
  if (pairs.length >= 2) return { cat: 'twopair', key: pairs[0] };
  if (pairs.length === 1) return { cat: 'pair', key: pairs[0] };
  for (let v = MAX_VALUE; v >= 1; v--) if (c[v] > 0) return { cat: 'high', key: v };
  return { cat: 'high', key: 0 };
}

/** Compare uniquement les identités (catégorie puis chiffre). */
export function compareIds(a: HandId, b: HandId): number {
  if (a.cat !== b.cat) return CAT_RANK[a.cat] - CAT_RANK[b.cat];
  return a.key - b.key;
}

/**
 * Départage officiel : combinaison, puis chiffre de la combinaison,
 * puis plus haute carte privée, puis l'autre carte privée.
 */
export function compareFull(a: HandId, aHole: readonly number[], b: HandId, bHole: readonly number[]): number {
  const ids = compareIds(a, b);
  if (ids !== 0) return ids;
  const [a1, a2] = [...aHole].sort((x, y) => y - x);
  const [b1, b2] = [...bHole].sort((x, y) => y - x);
  if (a1 !== b1) return a1 - b1;
  return a2 - b2;
}

/** Cartes restantes (par valeur) une fois retirées les cartes connues. */
export function remainingCounts(known: readonly number[]): number[] {
  const r = new Array<number>(MAX_VALUE + 1).fill(DECK_COPIES);
  r[0] = 0;
  for (const v of known) r[v] = Math.max(0, r[v] - 1);
  return r;
}

/**
 * Probabilité de chaque main finale pour UN adversaire quelconque,
 * connaissant les 4 cartes communes et les cartes qu'on voit (les siennes).
 * Renvoie une table handKey → probabilité.
 */
export function opponentDistribution(board: readonly number[], ownHole: readonly number[]): Map<string, number> {
  const r = remainingCounts([...board, ...ownHole]);
  const weights = new Map<string, number>();
  let total = 0;
  for (let a = 1; a <= MAX_VALUE; a++) {
    for (let b = a; b <= MAX_VALUE; b++) {
      const w = a === b ? (r[a] * (r[a] - 1)) / 2 : r[a] * r[b];
      if (w <= 0) continue;
      const id = evaluate([...board, a, b]);
      const k = handKey(id);
      weights.set(k, (weights.get(k) ?? 0) + w);
      total += w;
    }
  }
  if (total > 0) for (const [k, w] of weights) weights.set(k, w / total);
  return weights;
}

export function parseHandKey(k: string): HandId {
  const [cat, key] = k.split(':');
  return { cat: cat as Category, key: Number(key) };
}

export function freshDeck(): number[] {
  const deck: number[] = [];
  for (let v = 1; v <= MAX_VALUE; v++) for (let i = 0; i < DECK_COPIES; i++) deck.push(v);
  return deck;
}
