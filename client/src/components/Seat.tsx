// Un joueur autour de la table : avatar, chrono, jetons, cartes, dernière action, tir et résultat.
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, WifiOff } from 'lucide-react';
import { handName } from '../../../shared/hands';
import { isBetStreet, type LastAction, type PlayerView, type RoomView } from '../../../shared/protocol';
import { cls } from '../lib/util';
import type { Emote } from '../store';
import { Card } from './Card';
import { Chips, Progress } from './Ui';

export function actionText(a: LastAction | null): string | null {
  if (!a) return null;
  switch (a.type) {
    case 'check':
      return 'Check';
    case 'call':
      return `Suit +${a.amount}`;
    case 'raise':
      return a.opening ? `Mise ${a.amount}` : `Relance +${a.amount}`;
    case 'fold':
      return 'Couché';
  }
}

interface Props {
  p: PlayerView;
  view: RoomView;
  now: number;
  emote?: Emote;
  style?: React.CSSProperties;
  compact?: boolean;
}

export function Seat({ p, view, now, emote, style, compact }: Props) {
  const h = view.hand;
  const isTurn = !!h && h.turnId === p.id && !view.interlude;
  const result = h?.street === 'result' ? h.result : null;
  const entry = result?.entries.find((e) => e.id === p.id);
  const gain = result?.gains[p.id] ?? 0;
  const won = !!result && result.winners.includes(p.id) && !result.allSniped;
  const snipe = h?.snipes.find((s) => s.by === p.id);
  const showSnipe = !!snipe && (h?.street === 'snipe' || h?.street === 'result');
  const isFirst = h?.firstId === p.id && view.phase === 'playing';
  const playing = p.status === 'playing';
  const act = h && (isBetStreet(h.street) || p.folded) ? actionText(p.lastAction) : null;

  return (
    <div
      className={cls(
        'seat',
        compact && 'is-compact',
        isTurn && 'is-turn',
        p.folded && 'is-folded',
        !playing && 'is-out',
        won && 'is-winner',
        entry?.sniped && 'is-sniped',
      )}
      style={style}
    >
      <div className="seat-avatar">
        <span className="seat-emoji">{p.avatar}</span>
        {isFirst && (
          <span className="first-badge" title="Parle en premier">
            1er
          </span>
        )}
        {(p.isBot || p.autopilot) && (
          <span className="mini-badge" title={p.isBot ? 'Bot' : 'Pilote automatique'}>
            <Bot size={11} />
          </span>
        )}
        {!p.connected && !p.isBot && (
          <span className="mini-badge is-off" title="Hors ligne">
            <WifiOff size={11} />
          </span>
        )}
        <AnimatePresence>
          {emote && (
            <motion.span
              key={emote.id}
              className="emote-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.6 }}
              animate={{ opacity: 1, y: -6, scale: 1 }}
              exit={{ opacity: 0, y: -18 }}
            >
              {emote.emoji}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="seat-info">
        <div className="seat-name" title={p.name}>
          {p.name}
        </div>
        {!!h && isBetStreet(h.street) && p.streetBet > 0 && (
          <span className="seat-bet" title="Mise sur ce tour">
            <Chips n={p.streetBet} />
          </span>
        )}
        {playing ? (
          <>
            <span className="seat-chips">
              <Chips n={p.chips} />
              {gain > 0 && result && (
                <motion.span className="gain-inline" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                  +{gain}
                </motion.span>
              )}
            </span>
            <Progress value={p.chips} max={view.plan.target} tone={p.chips >= view.plan.target * 0.8 ? 'green' : 'gold'} />
          </>
        ) : p.status === 'survived' ? (
          <span className="status-tag is-safe">✓ Survie n°{p.survivedRank}</span>
        ) : p.status === 'eliminated' ? (
          <span className="status-tag is-dead">☠ Éliminé·e</span>
        ) : null}
      </div>

      {p.inHand && !p.folded && (
        <div className="seat-cards">
          {entry ? (
            <>
              <Card value={entry.hole[0]} size="xs" />
              <Card value={entry.hole[1]} size="xs" />
            </>
          ) : (
            <>
              <Card faceDown size="xs" />
              <Card faceDown size="xs" />
            </>
          )}
          {entry?.sniped && <span className="sniped-stamp">ABATTUE</span>}
        </div>
      )}

      <div className="seat-tags">
        {entry && <span className={cls('hand-tag', entry.sniped && 'is-sniped', won && 'is-win')}>{handName(entry.hand)}</span>}
        {!entry && act && <span className={cls('act-tag', p.lastAction?.type === 'fold' && 'is-fold', p.lastAction?.type === 'raise' && 'is-raise')}>{act}</span>}
        {showSnipe && !entry && (
          <span className={cls('snipe-tag', !snipe.cat && 'is-pass')}>{snipe.cat && snipe.key != null ? `🎯 ${handName({ cat: snipe.cat, key: snipe.key })}` : 'Pas de tir'}</span>
        )}
      </div>
    </div>
  );
}
