// Règles illustrées : l'essentiel en 30 secondes, puis le détail par onglet.
import { Coins, Crosshair as CrosshairIcon, HeartPulse, Layers, Lightbulb, Scale, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CAT_LABEL, CATEGORIES, handName, type Category } from '../../../shared/hands';
import { chipPlan } from '../../../shared/protocol';
import { useStore } from '../store';
import { cls } from '../lib/util';
import { CardRow } from './Card';
import { Modal } from './Ui';

export const HAND_EXAMPLES: Record<Category, { cards: number[]; key: number; note?: string }> = {
  quads: { cards: [7, 7, 7, 7, 2, 1], key: 7 },
  fullhouse: { cards: [7, 7, 7, 2, 2, 1], key: 7, note: 'on annonce le chiffre du brelan' },
  straight: { cards: [10, 9, 8, 7, 6, 1], key: 10, note: '5 chiffres qui se suivent (pas de 10-1-2)' },
  trips: { cards: [7, 7, 7, 4, 2, 1], key: 7 },
  twopair: { cards: [7, 7, 2, 2, 9, 1], key: 7, note: 'on annonce la paire la plus haute' },
  pair: { cards: [7, 7, 2, 4, 9, 1], key: 7 },
  high: { cards: [9, 7, 6, 4, 2, 1], key: 9, note: 'aucune combinaison : la plus haute carte' },
};

type Tab = 'short' | 'round' | 'hands' | 'snipe' | 'survive' | 'tips';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'short', label: "L'essentiel", icon: <Sparkles size={16} /> },
  { id: 'round', label: 'Une manche', icon: <Layers size={16} /> },
  { id: 'hands', label: 'Combinaisons', icon: <Scale size={16} /> },
  { id: 'snipe', label: 'Le tir', icon: <CrosshairIcon size={16} /> },
  { id: 'survive', label: 'Survivre', icon: <HeartPulse size={16} /> },
  { id: 'tips', label: 'Astuces', icon: <Lightbulb size={16} /> },
];

export function HandLadder({ compact }: { compact?: boolean }) {
  return (
    <ol className={cls('ladder', compact && 'ladder-compact')}>
      {CATEGORIES.map((cat, i) => {
        const ex = HAND_EXAMPLES[cat];
        return (
          <li key={cat} className="ladder-row">
            <span className="ladder-rank">{i + 1}</span>
            <div className="ladder-name">
              <b>{CAT_LABEL[cat]}</b>
              <span className="ladder-say">« {handName({ cat, key: ex.key })} »</span>
              {!compact && ex.note && <span className="ladder-note">{ex.note}</span>}
            </div>
            <CardRow values={ex.cards} size="xs" />
          </li>
        );
      })}
    </ol>
  );
}

function Step({ n, title, children }: { n: number | string; title: string; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-n">{n}</div>
      <div>
        <h4>{title}</h4>
        <div className="step-body">{children}</div>
      </div>
    </div>
  );
}

function RulesContent({ tab }: { tab: Tab }) {
  const show = chipPlan('show', 5);
  switch (tab) {
    case 'short':
      return (
        <div className="rules-section">
          <p className="lead">
            Un poker simplifié à <b>40 cartes numérotées de 1 à 10</b> (4 exemplaires de chaque, sans couleurs)… avec un twist : avant de
            révéler les cartes, chacun peut <b>viser une combinaison</b>. Si un joueur l'a, sa main est <b>abattue</b> et devient la pire de la
            table.
          </p>
          <div className="rule-cards">
            <div className="rule-card">
              <Coins />
              <h4>Mise comme au poker</h4>
              <p>2 cartes privées, 4 cartes communes dévoilées peu à peu, 4 tours de mise. Meilleure combinaison de 6 cartes.</p>
            </div>
            <div className="rule-card is-red">
              <CrosshairIcon />
              <h4>Vise la main adverse</h4>
              <p>
                Annonce par exemple « Suite au 9 ». Toute main qui correspond exactement tombe au dernier rang.
              </p>
            </div>
            <div className="rule-card is-green">
              <HeartPulse />
              <h4>Survis</h4>
              <p>
                Atteins l'objectif ({show.target} jetons à 5 joueurs, départ {show.start}) pour être sauvé. Le dernier joueur restant est
                éliminé.
              </p>
            </div>
          </div>
          <p className="muted small">
            Inspiré du jeu « Sniper Hold'em » de <i>The Devil's Plan</i> saison 2 (« À l'épreuve du diable » en VF). Création de fans, non
            officielle.
          </p>
        </div>
      );
    case 'round':
      return (
        <div className="rules-section steps">
          <Step n={1} title="Mise de base et distribution">
            Chaque joueur mise <b>1 jeton</b> et reçoit <b>2 cartes privées</b>, que lui seul voit.
          </Step>
          <Step n={2} title="Aucune carte commune → 1er tour de mise">
            Le premier joueur parle, puis on tourne dans le sens horaire. Tu peux <b>checker</b> (ne rien ajouter), <b>miser / relancer</b>,{' '}
            <b>suivre</b> la mise en cours ou <b>te coucher</b> (tu abandonnes ce que tu as déjà misé).
          </Step>
          <Step n={3} title="2 cartes, puis 1, puis 1 → un tour de mise à chaque fois">
            On dévoile <b>2 cartes communes</b>, nouveau tour de mise ; puis <b>1 carte</b> de plus, nouveau tour ; puis la <b>dernière</b>, dernier tour. Un tour s'arrête quand tous ceux qui restent ont misé autant.
          </Step>
          <Step n={4} title="Phase de tir">
            Dans l'ordre de parole, chacun peut <b>viser une combinaison</b> précise (ou ne pas tirer). Les tirs sont publics.
          </Step>
          <Step n={5} title="Abattage">
            On révèle les cartes. Les mains visées tombent au dernier rang ; la <b>meilleure main restante</b> remporte tout le pot.
          </Step>
          <div className="callout">
            <b>Plafond de mise :</b> personne ne peut engager plus de jetons que le tapis du joueur le plus pauvre encore dans la manche. Pas de
            tapis à rallonge ni de pots secondaires.
          </div>
          <div className="callout">
            Si tout le monde se couche sauf un joueur, il remporte le pot sans montrer ses cartes. Le premier à parler change à chaque manche.
          </div>
        </div>
      );
    case 'hands':
      return (
        <div className="rules-section">
          <p>
            Ta main = la <b>meilleure combinaison</b> formée avec tes 2 cartes privées et les 4 cartes communes. De la plus forte à la plus
            faible :
          </p>
          <HandLadder />
          <div className="callout">
            <b>Égalité ?</b> On compare dans l'ordre : la combinaison, puis son chiffre, puis ta plus haute carte privée, puis ton autre carte
            privée. Si tout est identique, le pot est partagé (les jetons restants vont un par un dans l'ordre de parole).
          </div>
          <p className="muted small">Pas de couleur ni de quinte flush : les cartes n'ont que des chiffres. Attention, ici la suite bat le brelan.</p>
        </div>
      );
    case 'snipe':
      return (
        <div className="rules-section">
          <p className="lead">
            Le tir est le cœur du jeu : une main énorme peut être abattue, et une main faible peut gagner en éliminant plus fort qu'elle.
          </p>
          <div className="snipe-demo">
            <div>
              <span className="demo-label">Tableau</span>
              <CardRow values={[9, 6, 5, 7]} size="sm" />
            </div>
            <div className="demo-arrow">→</div>
            <div className="demo-shot">
              🎯 « Suite au 9 »
              <span className="muted small">Tout joueur qui a un 8 en main (sans 10) a une Suite au 9 : sa main est abattue.</span>
            </div>
          </div>
          <ul className="bullets">
            <li>
              On annonce une <b>combinaison + son chiffre</b> : « Paire de 7 », « Suite au 9 », « Full aux 4 »…
            </li>
            <li>
              Un tir ne vise pas un joueur : il vise <b>une main</b>. Tous ceux qui l'ont exactement sont abattus — toi compris si c'est la tienne !
            </li>
            <li>Une main abattue est classée dernière. Si toutes les mains sont abattues, le pot est partagé entre tous.</li>
            <li>On tire chacun son tour en partant du premier joueur ; une même combinaison ne peut être visée qu'une fois.</li>
            <li>Tirer révèle des infos sur ta main… Ne pas tirer est aussi un choix.</li>
          </ul>
        </div>
      );
    case 'survive':
      return (
        <div className="rules-section">
          <ul className="bullets">
            <li>
              Dans l'émission, 5 joueurs commencent avec <b>{show.start} jetons</b> et doivent atteindre <b>{show.target}</b>. Ici, le départ et
              l'objectif s'adaptent au nombre de joueurs (et à la durée choisie).
            </li>
            <li>
              Dès que tu as <b>l'objectif ou plus</b> en fin de manche, tu rends l'objectif à la banque : tu es <b>sauvé</b> et tu quittes la
              table.
            </li>
            <li>
              Tes jetons en trop, tu les <b>offres à qui tu veux</b> parmi les joueurs restants. Chaque joueur à 0 jeton doit en recevoir au moins
              1.
            </li>
            <li>
              Chaque sauvetage retire des jetons du jeu : plus il reste peu de joueurs, plus c'est dur. En face-à-face, il faut prendre{' '}
              <b>tous</b> les jetons de l'adversaire.
            </li>
            <li>
              Le <b>dernier joueur</b> qui n'a pas survécu est <b>éliminé</b>.
            </li>
          </ul>
          <div className="callout">
            Le calcul est fait pour que, comme dans l'émission, il n'y ait de la place que pour tous les joueurs sauf un : départ × joueurs =
            objectif × (joueurs − 1).
          </div>
        </div>
      );
    case 'tips':
      return (
        <div className="rules-section">
          <ul className="bullets">
            <li>
              <b>Les paires servies</b> (2 cartes privées identiques) sont presque impossibles à deviner : c'est la main la plus redoutable.
            </li>
            <li>
              Une grosse main <b>évidente au vu du tableau</b> (brelan quand une paire est posée, suite qui saute aux yeux…) est une cible. Parfois,
              mieux vaut se coucher.
            </li>
            <li>
              <b>Bluff-tir</b> : viser une main plus faible que la tienne pour brouiller les pistes sur ce que tu as vraiment.
            </li>
            <li>
              Si tu tires en dernier, ne gâche pas ton tir : élimine la main la plus probable qui te bat.
            </li>
            <li>
              Si tu penses avoir la même main qu'un adversaire avec une moins bonne carte privée, <b>viser ta propre main</b> peut forcer une
              égalité.
            </li>
            <li>Les alliances sont permises : un survivant peut offrir son surplus à un allié.</li>
          </ul>
        </div>
      );
  }
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  const [tab, setTab] = useState<Tab>('short');
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Règles du jeu" wide className="rules-modal">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className={cls('tab', tab === t.id && 'is-on')} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <RulesContent tab={tab} />
      <div className="rules-nav">
        {tab !== 'tips' ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTab(TABS[TABS.findIndex((t) => t.id === tab) + 1].id)}
          >
            <span>Suivant : {TABS[TABS.findIndex((t) => t.id === tab) + 1].label} →</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            <span>C'est parti !</span>
          </button>
        )}
      </div>
    </Modal>
  );
}
