// Écran de jeu : table ovale, sièges, mises, panneau personnel, journal et moments forts.
import { BookOpen, Lightbulb, LightbulbOff, LogOut, MessageCircle, MoreVertical, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerView, RoomView } from '../../../shared/protocol';
import { Center } from '../components/Center';
import { Feed } from '../components/Feed';
import { MePanel } from '../components/MePanel';
import { FinalScreen, SnipeFlash, SurvivalOverlay } from '../components/Overlays';
import { Seat } from '../components/Seat';
import { Chips, Logo, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, useTick, vibrate } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

/** Positions (en %) des autres joueurs : arc supérieur si je suis assis, tour complet sinon. */
function seatPositions(k: number, full: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < k; i++) {
    let theta: number;
    if (full) theta = 270 - (i * 360) / k;
    else {
      const spread = k <= 4 ? 180 : 232;
      theta = 90 + spread / 2 - ((i + 0.5) * spread) / k;
    }
    const rad = (theta * Math.PI) / 180;
    // Le centre d'un siège est sous son avatar : on laisse de la marge en haut de l'arène.
    out.push({ x: 50 + 42 * Math.cos(rad), y: full ? 52 - 36 * Math.sin(rad) : 54 - 37 * Math.sin(rad) });
  }
  return out;
}

function useTableSounds(view: RoomView) {
  const lastId = useRef<number | null>(null);
  const lastHand = useRef<number>(0);
  useEffect(() => {
    const log = view.log;
    const newest = log.length ? log[log.length - 1].id : 0;
    if (lastId.current === null) {
      lastId.current = newest;
      return;
    }
    const fresh = log.filter((l) => l.id > (lastId.current ?? 0));
    lastId.current = newest;
    for (const l of fresh) {
      if (l.kind === 'action') {
        if (l.text.includes('se couche')) sfx.fold();
        else if (l.text.includes('check')) sfx.check();
        else sfx.chip();
      } else if (l.kind === 'snipe' && l.text.startsWith('💥')) sfx.hit();
      else if (l.kind === 'win') {
        const r = view.hand?.result;
        if (r?.winners.includes(view.me)) sfx.win();
        else sfx.chip();
      } else if (l.kind === 'eliminate') sfx.doom();
      else if (l.kind === 'chat' && l.playerId !== view.me) sfx.pop();
    }
    if (view.hand && view.hand.number !== lastHand.current) {
      lastHand.current = view.hand.number;
      [0, 90, 180].forEach((d) => setTimeout(() => sfx.deal(), d));
    }
  }, [view]);
}

function useTurnAlert(view: RoomView) {
  const myTurn = !!view.hand && view.hand.turnId === view.me && !view.interlude;
  const key = myTurn ? `${view.hand!.number}:${view.hand!.street}:${view.hand!.turnEndsAt}` : '';
  const prev = useRef('');
  useEffect(() => {
    if (key && key !== prev.current) {
      sfx.turn();
      vibrate([60, 40, 60]);
    }
    prev.current = key;
    document.title = myTurn ? "🎯 À toi de jouer — Hold'em Sniper" : "Hold'em Sniper";
  }, [key, myTurn]);
  useEffect(() => () => void (document.title = "Hold'em Sniper"), []);
}

export function Table({ view }: { view: RoomView }) {
  const now = useTick(250);
  const emotes = useStore((s) => s.emotes);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const feedOpen = useStore((s) => s.feedOpen);
  const setFeedOpen = useStore((s) => s.setFeedOpen);
  const unread = useStore((s) => s.unread);
  const [menu, setMenu] = useState(false);
  useTableSounds(view);
  useTurnAlert(view);

  const participants = view.players.filter((p) => p.status === 'playing' || p.status === 'survived' || p.status === 'eliminated');
  const meSeated = participants.some((p) => p.id === view.me);
  const others: PlayerView[] = useMemo(() => {
    if (!meSeated) return participants;
    const i = participants.findIndex((p) => p.id === view.me);
    return [...participants.slice(i + 1), ...participants.slice(0, i)];
  }, [view]);
  const positions = seatPositions(others.length, !meSeated);
  const lastEmote = (id: string) => [...emotes].reverse().find((e) => e.playerId === id);
  const isHost = view.hostId === view.me;
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const meView = view.players.find((p) => p.id === view.me);
  const h = view.hand;

  return (
    <div className="table-screen">
      <header className="topbar">
        <div className="topbar-left">
          <Logo size="sm" />
          <span className="pill pill-neutral code-pill">Table {view.code}</span>
        </div>
        <div className="topbar-mid">
          {h && <span className="muted small">Manche {h.number}</span>}
          <span className="goal" title="Objectif de survie">
            Objectif <Chips n={view.plan.target} />
          </span>
        </div>
        <div className="topbar-right">
          <button type="button" className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="Règles" title="Règles">
            <BookOpen size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPrefs({ hints: !prefs.hints })}
            aria-label={prefs.hints ? 'Masquer les conseils' : 'Afficher les conseils'}
            title={prefs.hints ? 'Masquer les conseils' : 'Afficher les conseils'}
          >
            {prefs.hints ? <Lightbulb size={20} /> : <LightbulbOff size={20} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setPrefs({ sound: !prefs.sound })} aria-label={prefs.sound ? 'Couper le son' : 'Activer le son'}>
            {prefs.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button type="button" className="icon-btn feed-toggle" onClick={() => setFeedOpen(true)} aria-label="Journal et chat">
            <MessageCircle size={20} />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <div className="menu-wrap">
            <button type="button" className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu">
              <MoreVertical size={20} />
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                {isHost && view.phase === 'playing' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      if (confirm('Arrêter la partie et revenir au salon ?')) void send('game:end');
                    }}
                  >
                    <Square size={16} /> Arrêter la partie
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    if (view.phase !== 'playing' || meView?.status !== 'playing' || confirm('Quitter ? Un pilote automatique jouera à ta place.')) void leaveRoom();
                  }}
                >
                  <LogOut size={16} /> Quitter la table
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="table-main">
        <div className={cls('arena', `n-${others.length}`, !meSeated && 'is-full')}>
          <div className="felt">
            <div className="felt-mark" aria-hidden />
            <Center view={view} />
          </div>
          {others.map((p, i) => {
            const pos = positions[i];
            return (
              <div key={p.id} className="seat-slot" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                <Seat p={p} view={view} now={now} emote={lastEmote(p.id)} compact={others.length > 5} />
              </div>
            );
          })}
          {spectators.length > 0 && <div className="spectators">👀 {spectators.length} spectateur{spectators.length > 1 ? 's' : ''}</div>}
        </div>
        {meSeated ? (
          <MePanel view={view} now={now} />
        ) : (
          <section className="me-panel spectator-bar">
            <p className="hint">Tu regardes la partie en spectateur : tu pourras jouer à la prochaine.</p>
          </section>
        )}
      </div>

      <aside className="side-feed">
        <Feed view={view} />
      </aside>

      <Modal open={feedOpen} onClose={() => setFeedOpen(false)} title="Journal & chat" className="feed-modal">
        <Feed view={view} />
      </Modal>

      <SnipeFlash view={view} />
      <SurvivalOverlay view={view} now={now} />
      {view.phase === 'finished' && <FinalScreen view={view} />}
    </div>
  );
}
