// Moments forts : annonce d'un tir, survie (et don du surplus), fin de partie.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, LogOut, RotateCcw, Scale } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { handName } from '../../../shared/hands';
import type { RoomView } from '../../../shared/protocol';
import { sfx } from '../lib/sound';
import { cls, plural, secondsLeft } from '../lib/util';
import { leaveRoom, send } from '../net';
import { Button, Chips, Crosshair } from './Ui';

/** Viseur plein écran à chaque tir annoncé. */
export function SnipeFlash({ view }: { view: RoomView }) {
  const h = view.hand;
  const [flash, setFlash] = useState<{ id: string; text: string; by: string } | null>(null);
  const seen = useRef<string>('');
  const hide = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!h) return;
    const last = h.snipes[h.snipes.length - 1];
    const id = `${h.number}:${h.snipes.length}`;
    if (!last || seen.current === id) return;
    seen.current = id;
    if (!last.cat || last.key == null) return;
    const by = view.players.find((p) => p.id === last.by)?.name ?? '?';
    setFlash({ id, text: handName({ cat: last.cat, key: last.key }), by });
    sfx.snipe();
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setFlash(null), 1700);
  }, [h?.number, h?.snipes.length]);
  useEffect(() => () => clearTimeout(hide.current), []);
  return (
    <AnimatePresence>
      {flash && (
        <motion.div key={flash.id} className="snipe-flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 2.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <Crosshair className="flash-cross" />
          </motion.div>
          <motion.div className="flash-text" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
            <span>{flash.by} vise</span>
            <b>{flash.text}</b>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GiftPanel({ view, now }: { view: RoomView; now: number }) {
  const it = view.interlude!;
  const recipients = view.players.filter((p) => p.status === 'playing');
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  const left = it.surplus - total;
  const broke = recipients.filter((r) => r.chips === 0);

  const even = () => {
    const sorted = [...recipients].sort((a, b) => a.chips - b.chips);
    const base = Math.floor(it.surplus / sorted.length);
    let rest = it.surplus - base * sorted.length;
    const next: Record<string, number> = {};
    for (const r of sorted) {
      next[r.id] = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
    }
    setAlloc(next);
  };
  const bump = (id: string, d: number) =>
    setAlloc((a) => {
      const cur = a[id] ?? 0;
      const nextVal = Math.max(0, Math.min(cur + d, cur + (it.surplus - Object.values(a).reduce((s, v) => s + v, 0))));
      return { ...a, [id]: nextVal };
    });
  const allTo = (id: string) => setAlloc({ [id]: it.surplus });

  return (
    <div className="gift">
      <h4>
        <Gift size={18} /> Offre tes {plural(it.surplus, 'jeton')} en trop
      </h4>
      <p className="muted small">
        À qui tu veux parmi les joueurs restants.{broke.length > 0 && ' Chaque joueur à 0 jeton doit en recevoir au moins 1.'}
      </p>
      <ul className="gift-list">
        {recipients.map((r) => (
          <li key={r.id} className="gift-row">
            <span className="avatar">{r.avatar}</span>
            <span className="gift-name">
              {r.name}
              <small>
                <Chips n={r.chips} /> {r.chips === 0 && <em className="warn">à sec</em>}
              </small>
            </span>
            <div className="gift-stepper">
              <button type="button" className="icon-btn" onClick={() => bump(r.id, -1)} aria-label="Moins">
                −
              </button>
              <b>{alloc[r.id] ?? 0}</b>
              <button type="button" className="icon-btn" onClick={() => bump(r.id, 1)} aria-label="Plus">
                +
              </button>
              <button type="button" className="chip-btn" onClick={() => allTo(r.id)}>
                Tout
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="gift-foot">
        <Button variant="ghost" icon={<Scale size={16} />} onClick={even}>
          Répartir équitablement
        </Button>
        <span className={cls('gift-left', left === 0 && 'is-ok')}>{left === 0 ? 'Tout est réparti' : `Reste ${left}`}</span>
      </div>
      <Button
        variant="gold"
        className="btn-wide btn-lg"
        disabled={left !== 0 || busy}
        onClick={async () => {
          setBusy(true);
          await send('game:gift', { allocation: alloc });
          setBusy(false);
        }}
      >
        Offrir et partir ({secondsLeft(it.endsAt, now)} s)
      </Button>
    </div>
  );
}

export function SurvivalOverlay({ view, now }: { view: RoomView; now: number }) {
  const it = view.interlude;
  const survivor = it ? view.players.find((p) => p.id === it.playerId) : null;
  const mine = !!it && it.playerId === view.me;
  const fired = useRef('');
  useEffect(() => {
    if (!it) return;
    const key = `${it.playerId}:${it.rank}`;
    if (fired.current === key) return;
    fired.current = key;
    sfx.survive();
    confetti({ particleCount: mine ? 160 : 70, spread: 80, origin: { y: 0.4 }, colors: ['#f4c25b', '#3ddc97', '#ffffff', '#ff3355'] });
  }, [it?.playerId, it?.rank]);

  return (
    <AnimatePresence>
      {it && survivor && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="overlay-card survive-card" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}>
            <div className="survive-emoji">{survivor.avatar}</div>
            <span className="eyebrow">Survie n°{it.rank}</span>
            <h2>{mine ? 'Tu as survécu !' : `${survivor.name} a survécu !`}</h2>
            <p className="muted">
              {survivor.name} a atteint {view.plan.target} jetons et les rend à la banque.
            </p>
            {it.needsGift && mine && <GiftPanel view={view} now={now} />}
            {it.needsGift && !mine && (
              <p className="gift-wait">
                <span className="spinner" /> {survivor.name} répartit ses {plural(it.surplus, 'jeton')} en trop… ({secondsLeft(it.endsAt, now)} s)
              </p>
            )}
            {!it.needsGift && view.lastGifts.length > 0 && (
              <ul className="gift-done">
                {view.lastGifts.map((g) => (
                  <li key={g.to}>
                    🎁 {plural(g.amount, 'jeton')} pour <b>{view.players.find((p) => p.id === g.to)?.name}</b>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function FinalScreen({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const isHost = view.hostId === view.me;
  const loser = final.find((f) => f.eliminated);
  const meOut = loser?.id === view.me;
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (meOut) sfx.doom();
    else {
      sfx.win();
      confetti({ particleCount: 140, spread: 100, origin: { y: 0.35 } });
    }
  }, [meOut]);
  const survivors = useMemo(() => final.filter((f) => !f.eliminated), [final]);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="overlay-card final-card" initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }}>
        <span className="eyebrow">Fin de la partie</span>
        {loser && (
          <div className="loser">
            <div className="loser-emoji">{loser.avatar}</div>
            <h2>{loser.id === view.me ? 'Tu es éliminé·e…' : `${loser.name} est éliminé·e`}</h2>
            <p className="muted">Dernier joueur en jeu : le diable a choisi sa victime.</p>
          </div>
        )}
        <ol className="podium">
          {survivors.map((f) => (
            <li key={f.id} className={cls(f.id === view.me && 'is-me')}>
              <span className="podium-rank">{f.rank}</span>
              <span className="avatar">{f.avatar}</span>
              <span className="podium-name">{f.name}</span>
              <span className="status-tag is-safe">Survie n°{f.rank}</span>
            </li>
          ))}
        </ol>
        <div className="modal-actions">
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
          {isHost ? (
            <Button variant="primary" className="btn-lg" icon={<RotateCcw size={18} />} onClick={() => void send('game:restart')}>
              Rejouer avec la table
            </Button>
          ) : (
            <span className="muted small">L'hôte peut relancer une partie.</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
