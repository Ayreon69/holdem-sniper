// Mon espace : mes cartes, ma combinaison, mes jetons et les actions possibles selon la phase.
import { Crosshair as CrosshairIcon, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { evaluate, handName, sameHand } from '../../../shared/hands';
import type { RoomView } from '../../../shared/protocol';
import { cls, secondsLeft } from '../lib/util';
import { send } from '../net';
import { useStore } from '../store';
import { Card } from './Card';
import { actionText } from './Seat';
import { SnipePicker } from './SnipePicker';
import { Button, Chips, Progress } from './Ui';

function hintFor(view: RoomView, myTurn: boolean): string | null {
  const h = view.hand;
  const me = view.players.find((p) => p.id === view.me);
  if (!h || !me) return null;
  if (me.status === 'survived') return 'Tu as survécu ! Tu peux regarder la suite de la partie.';
  if (me.status === 'eliminated') return 'Tu as été éliminé·e. Regarde comment ça se termine…';
  if (me.status === 'spectator') return 'Tu regardes la partie : tu joueras à la prochaine.';
  if (!me.inHand) return 'Tu n’as plus de jetons pour cette manche : attends un don d’un survivant.';
  if (me.folded) return 'Tu t’es couché·e : attends la prochaine manche.';
  switch (h.street) {
    case 'bet1':
      return myTurn
        ? 'Tu vois 2 cartes communes sur 4. Mise si ta main est prometteuse… sans trop la dévoiler.'
        : 'Premier tour de mise : observe qui mise fort, c’est un indice pour ton tir.';
    case 'bet2':
      return myTurn
        ? 'Toutes les cartes communes sont là. Une grosse main évidente risque d’être visée !'
        : 'Second tour de mise. Qui a l’air sûr de lui ?';
    case 'snipe':
      return myTurn
        ? 'À toi de tirer : devine la combinaison exacte d’un adversaire. Touché = sa main devient la pire.'
        : 'Les joueurs tirent chacun leur tour. Si ta main est visée, elle sera abattue.';
    case 'result':
      return null;
  }
}

export function MePanel({ view, now }: { view: RoomView; now: number }) {
  const hints = useStore((s) => s.prefs.hints);
  const me = view.players.find((p) => p.id === view.me);
  const h = view.hand;
  const myTurn = !!h && h.turnId === view.me && !view.interlude;
  const opt = h?.options ?? null;
  const [raise, setRaise] = useState(1);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRaiseOpen(false);
    setRaise(1);
  }, [h?.turnId, h?.street, h?.number]);
  useEffect(() => {
    if (!(myTurn && h?.street === 'snipe')) setPickerOpen(false);
  }, [myTurn, h?.street]);

  const hole = me?.hole ?? null;
  const board = h?.board ?? [];
  const myHand = useMemo(() => (hole && board.length >= 2 ? evaluate([...hole, ...board]) : null), [hole?.join(), board.join()]);
  const snipedOnMe =
    !!myHand && board.length === 4 && !!h && h.snipes.some((s) => s.cat && s.key != null && sameHand({ cat: s.cat, key: s.key }, myHand)) && !me?.folded;

  if (!me) return null;
  const target = view.plan.target;
  const turnPlayer = h?.turnId ? view.players.find((p) => p.id === h.turnId) : null;
  const hint = hints ? hintFor(view, myTurn) : null;
  const ready = !!h && h.readyIds.includes(view.me);

  const act = async (type: string, amount?: number) => {
    if (busy) return;
    setBusy(true);
    await send('game:action', { type, amount });
    setBusy(false);
  };

  const quick = opt
    ? [
        ...Array.from(new Set([1, 2, 5, Math.max(1, Math.round(h!.pot / 2)), h!.pot]))
          .filter((v) => v >= 1 && v < opt.maxRaise)
          .sort((a, b) => a - b)
          .slice(0, 4),
        opt.maxRaise,
      ]
    : [];
  const quickLabel = (v: number) => (opt && v === opt.maxRaise ? `Max ${v}` : h && v === h.pot ? `Pot ${v}` : `+${v}`);

  let actions: React.ReactNode = null;
  if (view.phase === 'playing' && h && !view.interlude) {
    if (myTurn && opt && (h.street === 'bet1' || h.street === 'bet2')) {
      const wasBet = h.currentBet === 0;
      actions = (
        <div className="actions">
          {raiseOpen && opt.canRaise && (
            <div className="raise-panel">
              <div className="raise-stepper">
                <button type="button" className="icon-btn" onClick={() => setRaise((r) => Math.max(1, r - 1))} aria-label="Moins">
                  <Minus size={18} />
                </button>
                <input
                  type="range"
                  min={1}
                  max={opt.maxRaise}
                  value={raise}
                  onChange={(e) => setRaise(Number(e.target.value))}
                  aria-label="Montant de la relance"
                />
                <button type="button" className="icon-btn" onClick={() => setRaise((r) => Math.min(opt.maxRaise, r + 1))} aria-label="Plus">
                  <Plus size={18} />
                </button>
              </div>
              <div className="raise-quick">
                {quick.map((v) => (
                  <button key={v} type="button" className={cls('chip-btn', raise === v && 'is-on')} onClick={() => setRaise(v)}>
                    {quickLabel(v)}
                  </button>
                ))}
              </div>
              <Button variant="gold" className="btn-wide" disabled={busy} onClick={() => void act('raise', raise)}>
                {wasBet ? `Miser ${raise}` : `Relancer +${raise}`} <small>(coût {opt.toCall + raise})</small>
              </Button>
            </div>
          )}
          <div className="action-row">
            <Button variant="danger" disabled={busy} onClick={() => void act('fold')}>
              Se coucher
            </Button>
            {opt.canCheck ? (
              <Button variant="secondary" disabled={busy} onClick={() => void act('check')}>
                Check
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void act('call')}>
                Suivre +{opt.toCall}
              </Button>
            )}
            {opt.canRaise && (
              <Button variant={raiseOpen ? 'ghost' : 'gold'} disabled={busy} onClick={() => setRaiseOpen((o) => !o)}>
                {raiseOpen ? 'Annuler' : wasBet ? 'Miser…' : 'Relancer…'}
              </Button>
            )}
          </div>
          <div className="turn-bar">
            <div className="turn-fill" style={{ width: `${Math.max(0, Math.min(100, ((h.turnEndsAt - now) / (view.settings.turnSeconds * 1000)) * 100))}%` }} />
          </div>
          <span className="muted small">
            À toi ! {secondsLeft(h.turnEndsAt, now)} s · plafond de mise {h.cap}
          </span>
        </div>
      );
    } else if (myTurn && h.street === 'snipe') {
      actions = (
        <div className="actions">
          <div className="action-row">
            <Button variant="ghost" disabled={busy} onClick={() => void send('game:snipe', { pass: true })}>
              Ne pas tirer
            </Button>
            <Button variant="danger" className="btn-lg pulse" icon={<CrosshairIcon size={20} />} onClick={() => setPickerOpen(true)}>
              Viser une main
            </Button>
          </div>
          <div className="turn-bar is-red">
            <div className="turn-fill" style={{ width: `${Math.max(0, Math.min(100, ((h.turnEndsAt - now) / (view.settings.turnSeconds * 1000)) * 100))}%` }} />
          </div>
          <span className="muted small">À toi de tirer ! {secondsLeft(h.turnEndsAt, now)} s</span>
        </div>
      );
    } else if (h.street === 'result' && me.status !== 'playing') {
      actions = <div className="actions waiting-turn">Manche suivante dans {secondsLeft(h.resultEndsAt, now)} s…</div>;
    } else if (h.street === 'result') {
      actions = (
        <div className="actions">
          <Button variant={ready ? 'ghost' : 'primary'} className="btn-wide" disabled={ready} onClick={() => void send('game:next')}>
            {ready ? 'Prêt ✓ en attente des autres…' : `Manche suivante (${secondsLeft(h.resultEndsAt, now)} s)`}
          </Button>
        </div>
      );
    } else if (turnPlayer) {
      actions = (
        <div className="actions waiting-turn">
          <span className="spinner" />
          <span>
            {h.street === 'snipe' ? 'Tir de' : 'Au tour de'} <b>{turnPlayer.name}</b>… {secondsLeft(h.turnEndsAt, now)} s
          </span>
        </div>
      );
    }
  }

  const playing = me.status === 'playing';
  const myAct = h && (h.street === 'bet1' || h.street === 'bet2') ? actionText(me.lastAction) : null;
  const result = h?.street === 'result' ? h.result : null;
  let outcome: { text: string; tone: 'win' | 'lose' | 'split' } | null = null;
  if (result && me.inHand) {
    const gain = result.gains[me.id] ?? 0;
    const entry = result.entries.find((e) => e.id === me.id);
    if (result.allSniped) outcome = { text: `Toutes les mains abattues : tu récupères ${gain}`, tone: 'split' };
    else if (result.winners.includes(me.id)) outcome = { text: `🏆 Tu gagnes ${gain} jeton${gain > 1 ? 's' : ''} !`, tone: 'win' };
    else if (entry?.sniped) outcome = { text: '💥 Ta main a été abattue', tone: 'lose' };
    else if (me.folded) outcome = null;
    else outcome = { text: 'Battu·e sur cette manche', tone: 'lose' };
  }

  return (
    <section className={cls('me-panel', myTurn && 'is-turn', snipedOnMe && 'is-doomed')}>
      <div className="me-hand">
        <div className="me-cards">
          {hole ? (
            <>
              <Card value={hole[0]} size="lg" dim={me.folded} highlight={hole[0] === hole[1]} />
              <Card value={hole[1]} size="lg" dim={me.folded} highlight={hole[0] === hole[1]} />
            </>
          ) : (
            <>
              <Card empty size="lg" />
              <Card empty size="lg" />
            </>
          )}
        </div>
        <div className="me-info">
          <div className="me-name">
            <span className="avatar">{me.avatar}</span> {me.name}
            {h?.firstId === me.id && view.phase === 'playing' && <span className="first-badge inline">1er</span>}
          </div>
          {playing ? (
            <>
              <div className="me-chips">
                <Chips n={me.chips} big />
                <span className="muted small">
                  / {target} · {me.chips >= target ? 'objectif atteint !' : `encore ${target - me.chips}`}
                </span>
              </div>
              <Progress value={me.chips} max={target} tone={me.chips >= target * 0.8 ? 'green' : 'gold'} />
            </>
          ) : me.status === 'survived' ? (
            <span className="status-tag is-safe">✓ Survie n°{me.survivedRank}</span>
          ) : me.status === 'eliminated' ? (
            <span className="status-tag is-dead">☠ Éliminé·e</span>
          ) : (
            <span className="status-tag">Spectateur</span>
          )}
          {myHand && hole && (
            <div className={cls('my-combo', snipedOnMe && 'is-doomed')}>
              {board.length === 4 ? 'Ta main' : 'Pour l’instant'} : <b>{handName(myHand)}</b>
              {hole[0] === hole[1] && <span className="pp-tag" title="Paire servie : très difficile à deviner">paire servie</span>}
            </div>
          )}
          {snipedOnMe && h?.street !== 'result' && <div className="doom-note">💀 Ta main a été visée : elle sera abattue.</div>}
          {outcome && <div className={cls('my-outcome', `is-${outcome.tone}`)}>{outcome.text}</div>}
          {(h?.street === 'bet1' || h?.street === 'bet2') && (me.streetBet > 0 || myAct) && (
            <div className="me-bet">
              {me.streetBet > 0 && (
                <>
                  Mise ce tour : <Chips n={me.streetBet} />
                </>
              )}
              {myAct && <span className="act-tag">{myAct}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="me-actions">
        {me.autopilot && me.connected ? (
          <div className="autopilot">
            <span>🤖 Le pilote automatique joue à ta place (temps écoulé deux fois).</span>
            <Button variant="gold" onClick={() => void send('game:back')}>
              Je suis là !
            </Button>
          </div>
        ) : (
          hint && <p className="hint">{hint}</p>
        )}
        {actions}
      </div>
      <SnipePicker view={view} open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </section>
  );
}
