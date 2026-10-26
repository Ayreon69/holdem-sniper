// Centre de la table : phase en cours, cartes communes, pot, tirs annoncés et résultat de la manche.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { handName } from '../../../shared/hands';
import { isBetStreet, type RoomView } from '../../../shared/protocol';
import { cls, plural } from '../lib/util';
import { Card } from './Card';
import { actionText } from './Seat';
import { Chips } from './Ui';

export const STREET_LABEL: Record<string, string> = {
  bet1: '1er tour de mise',
  bet2: '2e tour de mise',
  bet3: '3e tour de mise',
  bet4: '4e tour de mise',
  snipe: 'Phase de tir',
  result: 'Abattage',
};

export function Center({ view }: { view: RoomView }) {
  const h = view.hand;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  if (!h) return null;
  const result = h.street === 'result' ? h.result : null;
  const toast = useActionToast(view);
  const shots = h.snipes.filter((s) => s.cat && s.key != null);

  let banner: { title: string; sub?: string; tone: 'win' | 'split' | 'fold' } | null = null;
  if (result) {
    if (result.kind === 'fold') banner = { title: `${name(result.winners[0])} rafle le pot`, sub: 'Tout le monde s’est couché', tone: 'fold' };
    else if (result.allSniped) banner = { title: 'Toutes les mains abattues !', sub: `Pot de ${result.pot} partagé`, tone: 'split' };
    else if (result.split)
      banner = { title: `Égalité : ${result.winners.map(name).join(' & ')}`, sub: result.winningHand ? handName(result.winningHand) : undefined, tone: 'split' };
    else
      banner = {
        title: `${name(result.winners[0])} gagne ${plural(result.pot, 'jeton')}`,
        sub: result.winningHand ? `avec ${handName(result.winningHand)}` : undefined,
        tone: 'win',
      };
  }

  return (
    <div className="center">
      <div className="board">
        {[0, 1, 2, 3].map((i) =>
          h.board[i] != null ? (
            <motion.div key={`${h.number}-${i}`} initial={{ y: -14, opacity: 0, rotateY: 90 }} animate={{ y: 0, opacity: 1, rotateY: 0 }} transition={{ delay: (i % 2) * 0.12, duration: 0.35 }}>
              <Card value={h.board[i]} size="md" />
            </motion.div>
          ) : (
            <Card key={`${h.number}-${i}`} faceDown size="md" className="is-pending" />
          ),
        )}
      </div>
      <div className="action-toast-slot" aria-live="polite">
        <AnimatePresence mode="wait">
          {toast && (
            <motion.div key={toast.id} className={cls('action-toast', `is-${toast.type}`)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <span className="avatar">{toast.avatar}</span>
              <b>{toast.name}</b> {toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="pot-row">
        <span className={cls('street-pill', `is-${h.street}`)} title={`Manche ${h.number}`}>
          {STREET_LABEL[h.street]}
        </span>
        <span className="pot">
          Pot <Chips n={h.pot} />
        </span>
        {isBetStreet(h.street) && (
          <span className="cap" title="Personne ne peut engager plus que ce plafond sur cette manche">
            Plafond {h.cap}
          </span>
        )}
      </div>
      {banner ? (
        <motion.div
          key={`banner-${h.number}`}
          className={cls('result-banner', `is-${banner.tone}`)}
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22, delay: result?.kind === 'showdown' ? 0.5 : 0 }}
        >
          <b>{banner.title}</b>
          {banner.sub && <span>{banner.sub}</span>}
          {shots.length > 0 && <small>Tirs : {shots.map((s) => handName({ cat: s.cat!, key: s.key! })).join(' · ')}</small>}
        </motion.div>
      ) : (
        shots.length > 0 && (
          <div className="shots">
            {shots.map((s) => (
              <span key={s.by} className="shot">
                🎯 {handName({ cat: s.cat!, key: s.key! })}
                <small>{name(s.by)}</small>
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/** Petite notification éphémère : qui vient de checker, miser, suivre ou se coucher. */
function useActionToast(view: RoomView) {
  const h = view.hand;
  const [toast, setToast] = useState<{ id: string; avatar: string; name: string; text: string; type: string } | null>(null);
  const seen = useRef<Map<string, string>>(new Map());
  const hide = useRef<ReturnType<typeof setTimeout>>();
  const hand = h?.number;
  useEffect(() => {
    seen.current = new Map();
    setToast(null);
  }, [hand]);
  useEffect(() => {
    if (!h) return;
    for (const p of view.players) {
      const a = p.lastAction;
      const sig = a ? `${h.street}:${a.type}:${a.amount}:${h.pot}` : '';
      const prev = seen.current.get(p.id);
      seen.current.set(p.id, sig);
      if (!a || sig === prev || prev === undefined) continue;
      const label = actionText(a);
      if (!label) continue;
      setToast({ id: `${p.id}:${sig}`, avatar: p.avatar, name: p.name, text: label.charAt(0).toLowerCase() + label.slice(1), type: a.type });
      clearTimeout(hide.current);
      hide.current = setTimeout(() => setToast(null), 2200);
    }
  }, [view.players.map((p) => `${p.id}${p.lastAction?.type}${p.lastAction?.amount}`).join(), h?.street, h?.pot]);
  useEffect(() => () => clearTimeout(hide.current), []);
  return toast;
}
