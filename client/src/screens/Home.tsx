// Accueil : pseudo + avatar, créer / rejoindre une table, partie d'entraînement, règles.
import { motion } from 'framer-motion';
import { Bot, BookOpen, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { Card } from '../components/Card';
import { Button, Crosshair, Logo } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('hs:url', sync);
    return () => window.removeEventListener('hs:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <div className="home">
      <div className="home-bg" aria-hidden>
        <Crosshair className="home-bg-cross" />
      </div>
      <motion.header className="hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Logo size="lg" />
        <p className="tagline">Le poker où l'on ne bat pas l'adversaire&nbsp;: on l'abat.</p>
        <div className="hero-cards" aria-hidden>
          <Card value={7} size="md" className="hc hc1" />
          <Card value={7} size="md" className="hc hc2" />
          <Card faceDown size="md" className="hc hc3" />
        </div>
      </motion.header>

      <motion.section className="panel home-panel" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        {invited && (
          <div className="invite-banner">
            Tu es invité à la table <b>{invited}</b> — choisis ton pseudo et rejoins !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Sniper du 93"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <div className="avatar-picker" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={profile.avatar === a}
              className={cls('avatar-opt', profile.avatar === a && 'is-on')}
              onClick={() => setProfile({ avatar: a })}
            >
              {a}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="divider">
              <span>ou</span>
            </div>
            <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 4, autostart: true }))}>
              {busy === 'bots' ? 'Préparation…' : "S'entraîner contre 4 bots"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <section className="how">
        <div className="how-item">
          <span className="how-n">1</span>
          <div>
            <b>Mise</b>
            <p>2 cartes privées, 4 communes dévoilées 2 + 1 + 1, 4 tours de mise. Cartes de 1 à 10, sans couleurs.</p>
          </div>
        </div>
        <div className="how-item is-red">
          <span className="how-n">2</span>
          <div>
            <b>Vise</b>
            <p>Annonce une main (« Suite au 9 »). Si quelqu'un l'a, elle devient la pire de la table.</p>
          </div>
        </div>
        <div className="how-item is-green">
          <span className="how-n">3</span>
          <div>
            <b>Survis</b>
            <p>Atteins l'objectif de jetons pour être sauvé. Le dernier en jeu est éliminé.</p>
          </div>
        </div>
      </section>
      <footer className="home-foot">
        Inspiré du « Sniper Hold'em » de <i>The Devil's Plan</i> saison 2 (« À l'épreuve du diable »). Jeu de fans, non officiel.
      </footer>
    </div>
  );
}
