// Choix d'un tir : catégorie puis chiffre, avec les combinaisons impossibles grisées.
import { Crosshair as CrosshairIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CAT_LABEL,
  CATEGORIES,
  handKey,
  handName,
  keyRange,
  opponentDistribution,
  type Category,
  type HandId,
} from '../../../shared/hands';
import type { RoomView } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { send } from '../net';
import { useStore } from '../store';
import { CardRow } from './Card';
import { Button, Modal } from './Ui';

export function SnipePicker({ view, open, onClose }: { view: RoomView; open: boolean; onClose: () => void }) {
  const probs = useStore((s) => s.prefs.probs);
  const setPrefs = useStore((s) => s.setPrefs);
  const me = view.players.find((p) => p.id === view.me);
  const h = view.hand;
  const hole = me?.hole ?? [];
  const board = h?.board ?? [];
  const dist = useMemo(() => (board.length === 4 ? opponentDistribution(board, hole) : new Map<string, number>()), [board.join(), hole.join()]);
  const taken = useMemo(
    () => new Set((h?.snipes ?? []).filter((s) => s.cat && s.key != null).map((s) => handKey({ cat: s.cat!, key: s.key! }))),
    [h?.snipes],
  );
  const [cat, setCat] = useState<Category>('pair');
  const [key, setKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const target: HandId | null = key != null ? { cat, key } : null;
  const opponents = (h?.order ?? []).filter((id) => id !== view.me && !view.players.find((p) => p.id === id)?.folded).length;

  const chance = (id: HandId) => {
    const p = dist.get(handKey(id)) ?? 0;
    return 1 - Math.pow(1 - p, Math.max(1, opponents));
  };
  const catPossible = (c: Category) => [...dist.keys()].some((k) => k.startsWith(`${c}:`));

  const fire = async (pass: boolean) => {
    if (busy) return;
    setBusy(true);
    const ok = await send('game:snipe', pass ? { pass: true } : { cat: target!.cat, key: target!.key });
    setBusy(false);
    if (ok) {
      setKey(null);
      onClose();
    }
  };

  const [lo, hi] = keyRange(cat);
  const impossible = !!target && !dist.has(handKey(target));

  return (
    <Modal open={open} onClose={onClose} title={<span className="snipe-title"><CrosshairIcon size={20} /> Phase de tir</span>} className="snipe-modal">
      <p className="muted">
        Annonce une combinaison <b>exacte</b>. Si un joueur l'a, sa main devient la pire de la table — même si c'est la tienne.
      </p>
      <div className="snipe-context">
        <div>
          <span className="demo-label">Tableau</span>
          <CardRow values={board} size="sm" />
        </div>
        <div>
          <span className="demo-label">Ta main</span>
          <CardRow values={hole} size="sm" />
        </div>
      </div>

      <div className="cat-grid" role="radiogroup" aria-label="Combinaison">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={cls('cat-btn', c === cat && 'is-on', !catPossible(c) && 'is-impossible')}
            onClick={() => {
              setCat(c);
              setKey(null);
            }}
          >
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="key-grid">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((k) => {
          const id: HandId = { cat, key: k };
          const outOfRange = k < lo || k > hi;
          const possible = dist.has(handKey(id));
          const isTaken = taken.has(handKey(id));
          const pct = Math.round(chance(id) * 100);
          return (
            <button
              key={k}
              type="button"
              disabled={outOfRange || isTaken}
              className={cls('key-btn', key === k && 'is-on', !possible && 'is-impossible', isTaken && 'is-taken')}
              onClick={() => setKey(k)}
              title={isTaken ? 'Déjà visée' : !possible ? 'Impossible pour un adversaire' : undefined}
            >
              <span className="key-n">{k}</span>
              {probs && possible && !outOfRange && <span className="key-p">{pct < 1 ? '<1' : pct}%</span>}
            </button>
          );
        })}
      </div>

      <div className="snipe-preview">
        {target ? (
          <>
            <span className="snipe-target">🎯 « {handName(target)} »</span>
            {impossible && <span className="warn">Aucun adversaire ne peut avoir cette main au vu des cartes.</span>}
            {!impossible && probs && <span className="muted small">≈ {Math.round(chance(target) * 100)} % qu'au moins un adversaire l'ait (sans tenir compte des mises).</span>}
          </>
        ) : (
          <span className="muted">Choisis une combinaison puis un chiffre.</span>
        )}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={probs} onChange={(e) => setPrefs({ probs: e.target.checked })} />
        <span>Afficher les probabilités (mode entraînement)</span>
      </label>

      <div className="modal-actions">
        <Button variant="ghost" disabled={busy} onClick={() => void fire(true)}>
          Ne pas tirer
        </Button>
        <Button variant="primary" className="btn-lg" icon={<CrosshairIcon size={18} />} disabled={!target || busy} onClick={() => void fire(false)}>
          Tirer
        </Button>
      </div>
    </Modal>
  );
}
