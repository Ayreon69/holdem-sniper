// Une table de Hold'em Sniper : salon, déroulé des manches, tirs, survie et fin de partie.
import crypto from 'node:crypto';
import {
  compareFull,
  evaluate,
  freshDeck,
  handKey,
  handName,
  isValidHandId,
  sameHand,
  type HandId,
} from '../shared/hands';
import {
  AVATARS,
  BET_STREETS,
  BOARD_REVEALED,
  CHIP_PRESETS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  chipPlan,
  isBetStreet,
  type ActionType,
  type ChipPreset,
  type FinalEntry,
  type GiftRecord,
  type HandResult,
  type LastAction,
  type LogEntry,
  type LogKind,
  type MyOptions,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type ShowdownEntry,
  type SnipeView,
  type Street,
} from '../shared/protocol';
import { botBet, botSnipe, evenGift, randomPersonality, type Personality } from './bots';

const BOT_NAMES = ['Lucifer', 'Lilith', 'Méphisto', 'Asmodée', 'Belzébuth', 'Azazel', 'Mammon', 'Baal', 'Abaddon', 'Morgane'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (HS_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.HS_FAST === '1';
const SHOWDOWN_MS = FAST ? 1_200 : 12_000;
const FOLD_RESULT_MS = FAST ? 600 : 3_800;
const SURVIVE_MS = 4_500;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  chips: number;
  survivedRank: number | null;
}

interface Hand {
  number: number;
  order: string[];
  board: number[];
  revealed: number;
  hole: Map<string, number[]>;
  startStack: Map<string, number>;
  committed: Map<string, number>;
  streetBet: Map<string, number>;
  folded: Set<string>;
  acted: Set<string>;
  lastAction: Map<string, LastAction>;
  currentBet: number;
  street: Street;
  turnId: string | null;
  turnEndsAt: number;
  botActAt: number;
  snipes: SnipeView[];
  result: HandResult | null;
  resultEndsAt: number;
  resultShownAt: number;
  ready: Set<string>;
}

interface Interlude {
  playerId: string;
  surplus: number;
  needsGift: boolean;
  endsAt: number;
  botActAt: number;
  rank: number;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { preset: 'standard' };
  players: Player[] = [];
  plan = { start: 0, target: 0 };
  hand: Hand | null = null;
  interlude: Interlude | null = null;
  lastGifts: GiftRecord[] = [];
  final: FinalEntry[] | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};

  private log: LogEntry[] = [];
  private logId = 0;
  private survivedCount = 0;
  private handCount = 0;
  private firstSeat = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: 0,
      left: false,
      status,
      chips: 0,
      survivedRank: null,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seatFree = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS;
    if (this.phase === 'lobby' && !seatFree) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, seatFree ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('system', p.status === 'spectator' ? `${p.name} regarde la partie.` : `${p.name} rejoint la table.`);
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const avatars = AVATARS.filter((a) => !usedAvatars.has(a));
    const avatar = (avatars.length ? avatars : AVATARS)[crypto.randomInt((avatars.length ? avatars : AVATARS).length)];
    const bot = this.makePlayer(name, avatar, true, 'lobby');
    this.players.push(bot);
    this.addLog('system', `${bot.name} (bot) rejoint la table.`);
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    this.addLog('system', `${p.name} a été retiré de la table.`);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') {
      this.players = this.players.filter((x) => x.id !== id);
      this.addLog('system', `${p.name} a quitté la table.`);
    } else {
      p.left = true;
      if (p.status === 'playing') this.addLog('system', `${p.name} a quitté la partie : le pilote automatique prend le relais.`);
      else this.addLog('system', `${p.name} a quitté la table.`);
    }
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
    if (next) this.addLog('system', `${next.name} devient l'hôte de la table.`);
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    if (p.left) {
      p.left = false;
      this.addLog('system', `${p.name} est de retour.`);
    }
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    const preset = payload.preset;
    if (typeof preset === 'string' && preset in CHIP_PRESETS) this.settings.preset = preset as ChipPreset;
    return undefined;
  }

  // ───────────────────────────── Journal ─────────────────────────────

  addLog(kind: LogKind, text: string, playerId?: string): void {
    this.log.push({ id: ++this.logId, at: Date.now(), kind, text, playerId });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
  }

  chat(id: string, text: string): string | undefined {
    const p = this.get(id);
    if (!p) return 'Joueur introuvable.';
    this.addLog('chat', `${p.name} : ${text}`, p.id);
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return 'Il faut au moins 2 joueurs (ajoute des bots si besoin).';
    this.plan = chipPlan(this.settings.preset, seated.length);
    // Tirage au sort de l'ordre de jeu, comme dans l'émission.
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...shuffle([...seated]), ...spectators];
    for (const p of seated) {
      p.status = 'playing';
      p.chips = this.plan.start;
      p.survivedRank = null;
    }
    this.phase = 'playing';
    this.survivedCount = 0;
    this.handCount = 0;
    this.firstSeat = -1;
    this.final = null;
    this.lastGifts = [];
    this.interlude = null;
    this.addLog(
      'system',
      `La partie commence ! ${seated.length} joueurs, ${this.plan.start} jetons chacun. Objectif de survie : ${this.plan.target} jetons. Ordre tiré au sort : ${this.players
        .filter((p) => p.status === 'playing')
        .map((p) => p.name)
        .join(' → ')}.`,
    );
    this.startHand();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.chips = 0;
      p.survivedRank = null;
    }
    this.phase = 'lobby';
    this.hand = null;
    this.interlude = null;
    this.final = null;
    this.lastGifts = [];
    this.addLog('system', 'Retour au salon : nouvelle partie en préparation.');
    return undefined;
  }

  private startHand(): void {
    const n = this.players.length;
    const eligible = new Set(this.players.filter((p) => p.status === 'playing' && p.chips > 0).map((p) => p.id));
    if (eligible.size < 2) {
      this.finishGame();
      return;
    }
    let first = -1;
    for (let i = 1; i <= n; i++) {
      const s = (((this.firstSeat + i) % n) + n) % n;
      if (eligible.has(this.players[s].id)) {
        first = s;
        break;
      }
    }
    this.firstSeat = first;
    const order: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.players[(first + i) % n];
      if (eligible.has(p.id)) order.push(p.id);
    }
    const deck = shuffle(freshDeck());
    const h: Hand = {
      number: ++this.handCount,
      order,
      board: [],
      revealed: BOARD_REVEALED[0],
      hole: new Map(),
      startStack: new Map(),
      committed: new Map(),
      streetBet: new Map(),
      folded: new Set(),
      acted: new Set(),
      lastAction: new Map(),
      currentBet: 0,
      street: 'bet1',
      turnId: null,
      turnEndsAt: 0,
      botActAt: 0,
      snipes: [],
      result: null,
      resultEndsAt: 0,
      resultShownAt: 0,
      ready: new Set(),
    };
    for (const id of order) {
      const p = this.get(id)!;
      h.hole.set(id, [deck.pop()!, deck.pop()!]);
      h.startStack.set(id, p.chips);
      p.chips -= 1;
      h.committed.set(id, 1);
      h.streetBet.set(id, 0);
    }
    h.board = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];
    this.hand = h;
    this.interlude = null;
    this.lastGifts = [];
    this.addLog('hand', `Manche ${h.number} — ${this.get(order[0])!.name} parle en premier. Aucune carte commune pour l'instant.`);
    this.advanceBetting(h, 0);
  }

  /** Plafond d'engagement : le tapis du joueur le plus pauvre encore dans la manche. */
  private cap(h: Hand): number {
    let cap = Infinity;
    for (const id of h.order) if (!h.folded.has(id)) cap = Math.min(cap, h.startStack.get(id) ?? 0);
    return cap === Infinity ? 0 : cap;
  }

  private options(h: Hand, id: string): MyOptions {
    const street = h.streetBet.get(id) ?? 0;
    const committed = h.committed.get(id) ?? 0;
    const toCall = h.currentBet - street;
    const maxLevel = this.cap(h) - (committed - street);
    const maxRaise = Math.max(0, maxLevel - h.currentBet);
    return {
      toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise: maxRaise >= 1,
      minRaise: 1,
      maxRaise,
    };
  }

  private live(h: Hand): string[] {
    return h.order.filter((id) => !h.folded.has(id));
  }

  /** Cherche le prochain joueur devant parler à partir de l'index donné (en boucle). */
  private advanceBetting(h: Hand, fromIndex: number): void {
    const len = h.order.length;
    for (let i = 0; i < len; i++) {
      const id = h.order[(fromIndex + i) % len];
      if (h.folded.has(id)) continue;
      const settled = h.acted.has(id) && (h.streetBet.get(id) ?? 0) === h.currentBet;
      if (settled) continue;
      const opt = this.options(h, id);
      if (opt.canCheck && !opt.canRaise) {
        // Plus rien à décider : on « checke » automatiquement.
        h.acted.add(id);
        h.lastAction.set(id, { type: 'check' });
        continue;
      }
      this.setTurn(h, id, 900, 2400);
      return;
    }
    this.endStreet(h);
  }

  private setTurn(h: Hand, id: string, botMin: number, botMax: number): void {
    const now = Date.now();
    h.turnId = id;
    // Pas de chrono en jeu normal (0) ; le mode accéléré des tests en garde un.
    h.turnEndsAt = FAST ? now + 900 : 0;
    h.botActAt = FAST ? now + 40 : now + botMin + Math.random() * (botMax - botMin);
  }

  private endStreet(h: Hand): void {
    h.turnId = null;
    const step = BET_STREETS.indexOf(h.street as (typeof BET_STREETS)[number]);
    if (step >= 0 && step < BET_STREETS.length - 1) {
      const before = h.revealed;
      h.street = BET_STREETS[step + 1];
      h.revealed = BOARD_REVEALED[step + 1];
      h.currentBet = 0;
      h.acted.clear();
      for (const id of h.order) {
        h.streetBet.set(id, 0);
        if (h.lastAction.get(id)?.type !== 'fold') h.lastAction.delete(id);
      }
      const fresh = h.board.slice(before, h.revealed);
      this.addLog('hand', `${fresh.length > 1 ? 'Nouvelles cartes communes' : 'Nouvelle carte commune'} : ${fresh.join(' · ')}. Tableau : ${h.board.slice(0, h.revealed).join(' · ')}.`);
      this.advanceBetting(h, 0);
    } else if (step >= 0) {
      h.street = 'snipe';
      for (const id of h.order) if (h.lastAction.get(id)?.type !== 'fold') h.lastAction.delete(id);
      this.addLog('hand', 'Phase de tir : chacun peut viser une combinaison.');
      this.nextSniper(h);
    }
  }

  private nextSniper(h: Hand): void {
    const done = new Set(h.snipes.map((s) => s.by));
    const next = h.order.find((id) => !h.folded.has(id) && !done.has(id));
    if (next) this.setTurn(h, next, 1400, 3200);
    else this.showdown(h);
  }

  act(id: string, action: { type: ActionType; amount?: number }): string | undefined {
    const h = this.hand;
    if (this.phase !== 'playing' || !h || !isBetStreet(h.street)) return "Ce n'est pas le moment de miser.";
    if (h.turnId !== id) return "Ce n'est pas ton tour.";
    if (this.interlude) return "Ce n'est pas le moment de miser.";
    const p = this.get(id)!;
    const opt = this.options(h, id);
    const street = h.streetBet.get(id) ?? 0;
    const index = h.order.indexOf(id);
    switch (action.type) {
      case 'fold': {
        h.folded.add(id);
        h.lastAction.set(id, { type: 'fold' });
        this.addLog('action', `${p.name} se couche.`, id);
        const live = this.live(h);
        if (live.length === 1) {
          this.endByFold(h, live[0]);
          return undefined;
        }
        break;
      }
      case 'check': {
        if (!opt.canCheck) return `Il faut suivre (${opt.toCall}) ou se coucher.`;
        h.lastAction.set(id, { type: 'check' });
        this.addLog('action', `${p.name} : check.`, id);
        break;
      }
      case 'call': {
        if (!opt.canCall) return 'Rien à suivre : tu peux checker.';
        this.put(h, p, opt.toCall);
        h.lastAction.set(id, { type: 'call', amount: opt.toCall });
        this.addLog('action', `${p.name} suit (+${opt.toCall}).`, id);
        break;
      }
      case 'raise': {
        const amount = Math.floor(Number(action.amount));
        if (!opt.canRaise) return 'Le plafond de mise est atteint.';
        if (!Number.isFinite(amount) || amount < 1 || amount > opt.maxRaise) return `Relance entre 1 et ${opt.maxRaise}.`;
        const wasBet = h.currentBet === 0;
        h.currentBet += amount;
        const cost = h.currentBet - street;
        this.put(h, p, cost);
        h.acted.clear();
        h.lastAction.set(id, { type: 'raise', amount, opening: wasBet });
        this.addLog('action', wasBet ? `${p.name} mise ${amount}.` : `${p.name} relance de +${amount} (total ${h.currentBet}).`, id);
        break;
      }
      default:
        return 'Action inconnue.';
    }
    h.acted.add(id);
    this.advanceBetting(h, index + 1);
    return undefined;
  }

  private put(h: Hand, p: Player, amount: number): void {
    p.chips -= amount;
    h.streetBet.set(p.id, (h.streetBet.get(p.id) ?? 0) + amount);
    h.committed.set(p.id, (h.committed.get(p.id) ?? 0) + amount);
  }

  snipe(id: string, payload: Record<string, unknown>): string | undefined {
    const h = this.hand;
    if (this.phase !== 'playing' || !h || h.street !== 'snipe') return "Ce n'est pas la phase de tir.";
    if (h.turnId !== id) return "Ce n'est pas ton tour de tirer.";
    const p = this.get(id)!;
    if (payload.pass === true) {
      h.snipes.push({ by: id, cat: null, key: null });
      this.addLog('snipe', `${p.name} ne tire pas.`, id);
    } else {
      const cat = payload.cat;
      const key = Number(payload.key);
      if (!isValidHandId(cat, key)) return 'Combinaison invalide.';
      const target: HandId = { cat, key };
      if (h.snipes.some((s) => s.cat && s.key !== null && sameHand({ cat: s.cat, key: s.key }, target))) return 'Cette combinaison est déjà visée.';
      h.snipes.push({ by: id, cat, key });
      this.addLog('snipe', `🎯 ${p.name} vise « ${handName(target)} ».`, id);
    }
    this.nextSniper(h);
    return undefined;
  }

  private endByFold(h: Hand, winner: string): void {
    const pot = this.pot(h);
    const w = this.get(winner)!;
    w.chips += pot;
    h.turnId = null;
    h.street = 'result';
    h.result = {
      kind: 'fold',
      winners: [winner],
      allSniped: false,
      split: false,
      gains: { [winner]: pot },
      pot,
      entries: [],
      winningHand: null,
    };
    this.showResult(h, FOLD_RESULT_MS);
    this.addLog('win', `${w.name} remporte ${plural(pot, 'jeton')} : tout le monde s'est couché.`, winner);
  }

  private pot(h: Hand): number {
    let pot = 0;
    for (const v of h.committed.values()) pot += v;
    return pot;
  }

  private showdown(h: Hand): void {
    h.turnId = null;
    const live = this.live(h);
    const entries: ShowdownEntry[] = live.map((id) => {
      const hole = h.hole.get(id)!;
      const hand = evaluate([...hole, ...h.board]);
      const snipedBy = h.snipes.filter((s) => s.cat === hand.cat && s.key === hand.key).map((s) => s.by);
      return { id, hole, hand, sniped: snipedBy.length > 0, snipedBy };
    });
    const alive = entries.filter((e) => !e.sniped);
    let winners: string[];
    let winningHand: HandId | null = null;
    const allSniped = alive.length === 0;
    if (allSniped) {
      winners = live;
    } else {
      let best = alive[0];
      for (const e of alive) if (compareFull(e.hand, e.hole, best.hand, best.hole) > 0) best = e;
      winners = alive.filter((e) => compareFull(e.hand, e.hole, best.hand, best.hole) === 0).map((e) => e.id);
      winningHand = best.hand;
    }
    const pot = this.pot(h);
    const gains = this.splitPot(h, pot, winners);
    for (const [pid, g] of Object.entries(gains)) this.get(pid)!.chips += g;
    h.street = 'result';
    h.result = { kind: 'showdown', winners, allSniped, split: winners.length > 1, gains, pot, entries, winningHand };
    this.showResult(h, SHOWDOWN_MS);

    for (const e of entries) {
      const p = this.get(e.id)!;
      if (e.sniped) this.addLog('snipe', `💥 La main de ${p.name} est abattue (${handName(e.hand)}).`, e.id);
    }
    if (allSniped) {
      this.addLog('win', `Toutes les mains sont abattues ! Le pot de ${plural(pot, 'jeton')} est partagé.`);
    } else if (winners.length > 1) {
      this.addLog('win', `Égalité parfaite (${handName(winningHand!)}) : ${winners.map((w) => this.get(w)!.name).join(' et ')} partagent ${plural(pot, 'jeton')}.`);
    } else {
      this.addLog('win', `${this.get(winners[0])!.name} remporte ${plural(pot, 'jeton')} avec « ${handName(winningHand!)} ».`, winners[0]);
    }
  }

  /** Partage à parts égales ; les jetons restants vont un par un dans l'ordre de parole. */
  private splitPot(h: Hand, pot: number, winners: string[]): Record<string, number> {
    const gains: Record<string, number> = {};
    const base = Math.floor(pot / winners.length);
    let rest = pot - base * winners.length;
    for (const id of h.order) {
      if (!winners.includes(id)) continue;
      gains[id] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
    }
    return gains;
  }

  private showResult(h: Hand, ms: number): void {
    const now = Date.now();
    h.resultShownAt = now;
    h.resultEndsAt = now + ms;
    h.ready.clear();
  }

  readyNext(id: string): string | undefined {
    const h = this.hand;
    if (this.phase !== 'playing' || !h || h.street !== 'result' || this.interlude) return undefined;
    h.ready.add(id);
    const needed = this.players.filter((p) => !p.isBot && !this.isAuto(p) && p.connected && p.status === 'playing');
    if (needed.every((p) => h.ready.has(p.id)) && Date.now() - h.resultShownAt >= 1500) this.afterHand();
    return undefined;
  }

  private afterHand(): void {
    if (this.hand) this.hand.turnId = null;
    this.processSurvivors();
  }

  private playing(): Player[] {
    return this.players.filter((p) => p.status === 'playing');
  }

  private processSurvivors(): void {
    const target = this.plan.target;
    const candidates = this.playing()
      .filter((p) => p.chips >= target)
      .sort((a, b) => b.chips - a.chips);
    if (candidates.length === 0) {
      this.interlude = null;
      if (!this.checkEnd()) this.startHand();
      return;
    }
    const p = candidates[0];
    p.chips -= target;
    p.status = 'survived';
    p.survivedRank = ++this.survivedCount;
    const surplus = p.chips;
    const others = this.playing();
    this.lastGifts = [];
    this.addLog('survive', `✨ ${p.name} atteint ${target} jetons, les rend à la banque et survit (${ordinal(p.survivedRank)}) !`, p.id);
    const now = Date.now();
    const needsGift = surplus > 0 && others.length > 0;
    if (!needsGift) p.chips = 0;
    this.interlude = {
      playerId: p.id,
      surplus,
      needsGift,
      endsAt: needsGift ? 0 : now + SURVIVE_MS,
      botActAt: now + 2200 + Math.random() * 1500,
      rank: p.survivedRank,
    };
  }

  gift(id: string, allocation: unknown): string | undefined {
    const it = this.interlude;
    if (!it || !it.needsGift || it.playerId !== id) return "Ce n'est pas à toi de répartir des jetons.";
    const recipients = this.playing();
    const alloc: Record<string, number> = {};
    let sum = 0;
    if (!allocation || typeof allocation !== 'object') return 'Répartition invalide.';
    for (const [pid, raw] of Object.entries(allocation as Record<string, unknown>)) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) return 'Répartition invalide.';
      if (n === 0) continue;
      if (!recipients.some((r) => r.id === pid)) return 'On ne peut donner qu’aux joueurs encore en jeu.';
      alloc[pid] = n;
      sum += n;
    }
    if (sum !== it.surplus) return `Il faut répartir exactement ${plural(it.surplus, 'jeton')} (actuellement ${sum}).`;
    const broke = recipients.filter((r) => r.chips === 0);
    const required = Math.min(it.surplus, broke.length);
    if (broke.filter((r) => (alloc[r.id] ?? 0) >= 1).length < required) return 'Chaque joueur à 0 jeton doit recevoir au moins 1 jeton.';
    this.applyGift(it, alloc);
    return undefined;
  }

  private applyGift(it: Interlude, alloc: Record<string, number>): void {
    const giver = this.get(it.playerId)!;
    giver.chips = 0;
    this.lastGifts = [];
    for (const [pid, n] of Object.entries(alloc)) {
      const r = this.get(pid)!;
      r.chips += n;
      this.lastGifts.push({ from: giver.id, to: pid, amount: n });
    }
    const text = this.lastGifts.map((g) => `${plural(g.amount, 'jeton')} à ${this.get(g.to)!.name}`).join(', ');
    this.addLog('gift', `🎁 ${giver.name} offre ${text}.`, giver.id);
    it.needsGift = false;
    it.endsAt = Date.now() + 3200;
  }

  private autoGift(it: Interlude): void {
    const recipients = this.playing().map((p) => ({ id: p.id, chips: p.chips }));
    this.applyGift(it, evenGift(it.surplus, recipients));
  }

  private finishInterlude(): void {
    this.interlude = null;
    this.processSurvivors();
  }

  private checkEnd(): boolean {
    const left = this.playing();
    if (left.length > 1) return false;
    this.finishGame();
    return true;
  }

  private finishGame(): void {
    const remaining = this.playing().sort((a, b) => b.chips - a.chips);
    // Garde-fou : s'il reste plusieurs joueurs sans pouvoir jouer, le plus pauvre est éliminé.
    for (const p of remaining.slice(0, -1)) {
      p.status = 'survived';
      p.survivedRank = ++this.survivedCount;
    }
    const loser = remaining[remaining.length - 1];
    if (loser) {
      loser.status = 'eliminated';
      this.addLog('eliminate', `☠ ${loser.name} est le dernier joueur en jeu : élimination !`, loser.id);
    }
    this.phase = 'finished';
    this.clearTimer();
    if (this.hand) this.hand.turnId = null;
    this.interlude = null;
    const participants = this.players.filter((p) => p.status === 'survived' || p.status === 'eliminated');
    this.final = participants
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, rank: p.survivedRank, eliminated: p.status === 'eliminated' }))
      .sort((a, b) => (a.eliminated ? 1 : 0) - (b.eliminated ? 1 : 0) || (a.rank ?? 99) - (b.rank ?? 99));
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    this.addLog('system', "L'hôte a arrêté la partie.");
    return this.restart(by);
  }

  // ───────────────────────────── Minuteries & automatismes ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private at(ms: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(ms, 2_147_000_000)));
  }

  /** Quand agir pour un joueur : bot → délai naturel, déconnecté → fin du délai de grâce, sinon jamais (pas de chrono). */
  private dueAt(p: Player, deadline: number, botAt: number): number {
    const limit = deadline > 0 ? deadline : Infinity;
    if (this.isAuto(p)) return p.isBot ? botAt : Math.min(botAt, Date.now() + 700);
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'playing') return;
    const now = Date.now();
    const it = this.interlude;
    if (it) {
      if (it.needsGift) {
        const giver = this.get(it.playerId)!;
        const due = this.dueAt(giver, it.endsAt, it.botActAt);
        if (Number.isFinite(due)) {
          this.at(due - now, () => {
            if (this.interlude !== it || !it.needsGift) return;
            if (this.isAuto(giver)) this.autoGift(it);
          });
        }
      } else {
        this.at(it.endsAt - now, () => {
          if (this.interlude === it) this.finishInterlude();
        });
      }
      return;
    }
    const h = this.hand;
    if (!h) return;
    if (h.street === 'result') {
      this.at(h.resultEndsAt - now, () => {
        if (this.hand === h && h.street === 'result' && !this.interlude) this.afterHand();
      });
      return;
    }
    if (!h.turnId) return;
    const p = this.get(h.turnId);
    if (!p) return;
    const turnId = h.turnId;
    const street = h.street;
    const due = this.dueAt(p, h.turnEndsAt, h.botActAt);
    if (!Number.isFinite(due)) return;
    this.at(due - now, () => {
      if (this.hand !== h || h.turnId !== turnId || h.street !== street) return;
      // Hors mode accéléré, seul un joueur parti ou déconnecté est relayé : jamais de chrono sur un joueur présent.
      if (this.isAuto(p) || FAST) this.autoPlay(h, p);
    });
  }

  private autoPlay(h: Hand, p: Player): void {
    const hole = h.hole.get(p.id)!;
    const opponents = this.live(h).length - 1;
    if (h.street === 'snipe') {
      const taken = new Set(h.snipes.filter((s) => s.cat && s.key !== null).map((s) => handKey({ cat: s.cat!, key: s.key! })));
      const target = botSnipe({ hole, board: h.board, opponents, taken });
      this.snipe(p.id, target ? { cat: target.cat, key: target.key } : { pass: true });
      return;
    }
    const opt = this.options(h, p.id);
    const decision = botBet({
      hole,
      board: h.board.slice(0, h.revealed),
      opponents,
      pot: this.pot(h),
      toCall: opt.toCall,
      canCheck: opt.canCheck,
      canRaise: opt.canRaise,
      maxRaise: opt.maxRaise,
      personality: p.personality,
    });
    const err = this.act(p.id, decision);
    if (err) this.act(p.id, { type: opt.canCheck ? 'check' : 'fold' });
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  viewFor(viewerId: string): RoomView {
    const h = this.hand;
    const revealedIds = h?.result?.kind === 'showdown' ? new Set(h.result.entries.map((e) => e.id)) : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      plan: this.phase === 'lobby' ? chipPlan(this.settings.preset, this.seated.length) : { ...this.plan },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        chips: p.chips,
        survivedRank: p.survivedRank,
        inHand: !!h && h.order.includes(p.id),
        folded: !!h && h.folded.has(p.id),
        committed: h?.committed.get(p.id) ?? 0,
        streetBet: h?.streetBet.get(p.id) ?? 0,
        lastAction: h?.lastAction.get(p.id) ?? null,
        hole: h && h.hole.has(p.id) && (p.id === viewerId || revealedIds?.has(p.id)) ? [...h.hole.get(p.id)!] : null,
        hasSniped: !!h && h.snipes.some((s) => s.by === p.id),
      })),
      hand: h
        ? {
            number: h.number,
            firstId: h.order[0],
            order: [...h.order],
            street: h.street,
            board: h.board.slice(0, h.revealed),
            pot: h.result ? h.result.pot : this.pot(h),
            cap: this.cap(h),
            currentBet: h.currentBet,
            turnId: h.turnId,
            turnEndsAt: h.turnEndsAt,
            snipes: h.snipes.map((s) => ({ ...s })),
            result: h.result,
            resultEndsAt: h.resultEndsAt,
            readyIds: [...h.ready],
            options: h.turnId === viewerId && isBetStreet(h.street) ? this.options(h, viewerId) : null,
          }
        : null,
      interlude: this.interlude
        ? {
            playerId: this.interlude.playerId,
            surplus: this.interlude.surplus,
            needsGift: this.interlude.needsGift,
            endsAt: this.interlude.endsAt,
            rank: this.interlude.rank,
          }
        : null,
      lastGifts: [...this.lastGifts],
      log: this.log.slice(-80),
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
