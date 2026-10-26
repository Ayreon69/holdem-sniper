// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes.
import type { Category, HandId } from './hands';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export const AVATARS = ['😈', '🦊', '🐺', '🦉', '🐍', '🦅', '🐯', '🐼', '🐸', '🦄', '👻', '🎩', '🃏', '🧠', '🔥', '🐙'] as const;
export const EMOTES = ['😂', '🔥', '😱', '🤔', '🎯', '💀', '👏', '🙏'] as const;

export type ChipPreset = 'express' | 'standard' | 'show';
export const CHIP_PRESETS: Record<ChipPreset, { label: string; base: number; hint: string }> = {
  express: { label: 'Express', base: 20, hint: '≈ 15 min' },
  standard: { label: 'Classique', base: 40, hint: '≈ 30 min' },
  show: { label: "Comme dans l'émission", base: 60, hint: '45 min et +' },
};

export interface Settings {
  preset: ChipPreset;
}

/**
 * Jetons de départ et objectif de survie pour n joueurs.
 * Comme dans l'émission (5 × 60 = 4 × 75), tout est calibré pour que
 * exactement n − 1 joueurs puissent survivre : départ × n = objectif × (n − 1).
 */
export function chipPlan(preset: ChipPreset, players: number): { start: number; target: number } {
  const n = Math.max(2, players);
  const base = CHIP_PRESETS[preset].base;
  const unit = n - 1;
  const start = Math.max(unit, Math.round(base / unit) * unit);
  return { start, target: start + start / unit };
}

export type PlayerStatus = 'lobby' | 'playing' | 'survived' | 'eliminated' | 'spectator';
export type Street = 'bet1' | 'bet2' | 'bet3' | 'bet4' | 'snipe' | 'result';

/** Tours de mise dans l'ordre, et nombre de cartes communes visibles à chacun (0, 2, 3 puis 4). */
export const BET_STREETS = ['bet1', 'bet2', 'bet3', 'bet4'] as const;
export const BOARD_REVEALED = [0, 2, 3, 4] as const;
export const isBetStreet = (s: Street): boolean => (BET_STREETS as readonly string[]).includes(s);
export type ActionType = 'check' | 'call' | 'raise' | 'fold';

export interface LastAction {
  type: ActionType;
  amount?: number;
  /** Première mise du tour (« Mise 3 ») plutôt qu'une relance. */
  opening?: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  chips: number;
  survivedRank: number | null;
  /** Données de la manche en cours (null si pas distribué). */
  inHand: boolean;
  folded: boolean;
  committed: number;
  streetBet: number;
  lastAction: LastAction | null;
  hole: number[] | null;
  hasSniped: boolean;
}

export interface SnipeView {
  by: string;
  cat: Category | null;
  key: number | null;
}

export interface ShowdownEntry {
  id: string;
  hole: number[];
  hand: HandId;
  sniped: boolean;
  snipedBy: string[];
}

export interface HandResult {
  kind: 'fold' | 'showdown';
  winners: string[];
  allSniped: boolean;
  split: boolean;
  gains: Record<string, number>;
  pot: number;
  entries: ShowdownEntry[];
  winningHand: HandId | null;
}

export interface MyOptions {
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
}

export interface HandView {
  number: number;
  firstId: string;
  order: string[];
  street: Street;
  board: number[];
  pot: number;
  cap: number;
  currentBet: number;
  turnId: string | null;
  turnEndsAt: number;
  snipes: SnipeView[];
  result: HandResult | null;
  resultEndsAt: number;
  readyIds: string[];
  options: MyOptions | null;
}

export interface InterludeView {
  playerId: string;
  surplus: number;
  needsGift: boolean;
  endsAt: number;
  rank: number;
}

export interface GiftRecord {
  from: string;
  to: string;
  amount: number;
}

export type LogKind = 'system' | 'hand' | 'action' | 'snipe' | 'win' | 'survive' | 'eliminate' | 'gift' | 'chat';
export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
  playerId?: string;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  rank: number | null;
  eliminated: boolean;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  plan: { start: number; target: number };
  players: PlayerView[];
  hand: HandView | null;
  interlude: InterludeView | null;
  lastGifts: GiftRecord[];
  log: LogEntry[];
  final: FinalEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;
