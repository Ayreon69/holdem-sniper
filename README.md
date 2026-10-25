# 🎯 Hold'em Sniper

**Le poker où l'on ne bat pas l'adversaire : on l'abat.**

Version web multijoueur du jeu « Sniper Hold'em » de *The Devil's Plan* saison 2 (Netflix, « À l'épreuve du diable » en VF).
On joue entre amis depuis un navigateur, sur ordinateur ou téléphone, sans compte ni installation. Création de fans, non officielle.

## Règles en bref

- **40 cartes** numérotées de 1 à 10 (4 exemplaires de chaque), sans couleurs.
- Chaque manche : mise de base de 1 jeton, **2 cartes privées**, **2 cartes communes** → 1er tour de mise, **2 cartes communes de plus** → 2e tour de mise.
- **Plafond** : personne ne peut engager plus que le tapis du joueur le plus pauvre encore dans la manche.
- **Phase de tir** : dans l'ordre de parole, chacun peut annoncer une combinaison exacte (« Suite au 9 », « Full aux 7 »…). Toute main qui correspond est **abattue** et passe au dernier rang, y compris celle du tireur.
- La meilleure main restante remporte le pot. Égalité : chiffre de la combinaison, puis plus haute carte privée, puis l'autre. Si tout est abattu, le pot est partagé.
- Combinaisons : Carré > Full > Suite > Brelan > Double paire > Paire > Carte haute.
- **Survie** : dès qu'un joueur atteint l'objectif (75 jetons à 5 joueurs partis de 60), il le rend à la banque, est sauvé et offre son surplus à qui il veut (au moins 1 jeton à chaque joueur à sec). Le dernier joueur restant est éliminé.
- Départ et objectif s'adaptent au nombre de joueurs : `départ × joueurs = objectif × (joueurs − 1)`, comme dans l'émission.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation et QR code
- 2 à 8 joueurs, bots pour compléter la table ou s'entraîner seul
- Reprise automatique après une coupure ; pilote automatique si un joueur s'absente
- Sélecteur de tir qui grise les mains impossibles, probabilités en option (mode entraînement)
- Règles illustrées, conseils contextuels, journal de partie, chat et réactions
- Sons synthétisés, vibrations sur mobile, installable comme une appli (PWA)

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur :3001
npm run dev:client   # interface Vite sur :5173
npm test             # moteur de jeu + parties simulées entre bots
npm run build && npm run e2e   # partie complète de bout en bout
```

`HS_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : évaluation des mains, distribution des mains adverses, contrat client/serveur
- `server/` : Express + Socket.IO, moteur de table (`room.ts`), bots (`bots.ts`)
- `client/` : React + Vite + Framer Motion
- Déploiement : un seul service Node sur Render (`npm ci && npm run build`, puis `npm start`)
