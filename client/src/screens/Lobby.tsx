// Salon : partage de la table, liste des joueurs, réglages de l'hôte et lancement.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { CHIP_PRESETS, MAX_PLAYERS, MIN_PLAYERS, chipPlan, type ChipPreset, type RoomView } from '../../../shared/protocol';
import { Button, Chips, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Hold'em Sniper", text: `Rejoins ma table de Hold'em Sniper (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <Logo size="sm" />
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>

      <motion.section className="panel code-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="eyebrow">Code de la table</span>
        <div className="big-code" aria-label={`Code ${view.code}`}>
          {view.code.split('').map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <div className="share-row">
          <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
            Inviter des amis
          </Button>
          <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </Button>
          <Button variant="ghost" icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="QR code">
            QR
          </Button>
        </div>
      </motion.section>

      <div className="lobby-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>
              Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
            </h3>
            {isHost && (
              <Button icon={<Bot size={18} />} disabled={seated.length >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                Ajouter un bot
              </Button>
            )}
          </div>
          <ul className="player-list">
            {seated.map((p, i) => (
              <motion.li
                key={p.id}
                className={cls('player-row', p.id === view.me && 'is-me')}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <span className="avatar">{p.avatar}</span>
                <span className="player-name">
                  {p.name}
                  {p.id === view.me && <span className="muted"> (toi)</span>}
                </span>
                {p.isHost && (
                  <Pill tone="gold">
                    <Crown size={12} /> Hôte
                  </Pill>
                )}
                {p.isBot && <Pill tone="blue">Bot</Pill>}
                {!p.connected && <Pill>Hors ligne</Pill>}
                {isHost && p.id !== view.me && (
                  <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
                    <UserX size={18} />
                  </button>
                )}
              </motion.li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
              <li key={`empty${i}`} className="player-row is-empty">
                <span className="avatar">?</span>
                <span className="player-name muted">En attente d'un joueur…</span>
              </li>
            ))}
          </ul>
          {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Réglages</h3>
            {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
          </div>
          <label className="field-label">Durée de la partie</label>
          <Segmented<ChipPreset>
            value={view.settings.preset}
            disabled={!isHost}
            onChange={(preset) => void send('room:settings', { preset })}
            options={(Object.keys(CHIP_PRESETS) as ChipPreset[]).map((k) => {
              const plan = chipPlan(k, Math.max(2, seated.length));
              return { value: k, label: CHIP_PRESETS[k].label, sub: `${plan.start} → ${plan.target}` };
            })}
          />
          <div className="plan-box">
            <div>
              <span className="muted small">Départ</span>
              <Chips n={view.plan.start} big />
            </div>
            <div className="plan-arrow">→</div>
            <div>
              <span className="muted small">Objectif de survie</span>
              <Chips n={view.plan.target} big className="is-gold" />
            </div>
          </div>
          <p className="muted small">
            À {Math.max(2, seated.length)} joueurs, il y a de la place pour {Math.max(1, seated.length - 1)} survivant
            {seated.length - 1 > 1 ? 's' : ''} : le dernier en jeu est éliminé.
          </p>
        </section>
      </div>

      <div className="lobby-cta">
        {isHost ? (
          <Button
            variant="primary"
            className="btn-lg btn-wide"
            icon={<Play size={20} />}
            disabled={seated.length < MIN_PLAYERS}
            onClick={() => void send('game:start')}
          >
            {seated.length < MIN_PLAYERS ? 'Il faut au moins 2 joueurs' : `Lancer la partie (${seated.length} joueurs)`}
          </Button>
        ) : (
          <div className="waiting">
            <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
          </div>
        )}
        <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Nouveau ? Les règles en 1 minute
        </Button>
      </div>

      <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
        <div className="qr-box">
          <QRCodeSVG value={url} size={220} bgColor="#ffffff" fgColor="#0b0b10" level="M" includeMargin />
          <p className="muted small">Scanne pour rejoindre la table directement.</p>
          <code className="url-code">{url}</code>
        </div>
      </Modal>
    </div>
  );
}
