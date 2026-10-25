// Test de bout en bout : 2 humains (socket.io) + 2 bots jouent une partie complète sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), HS_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (8 min)'), 480_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, session: null };
  socket.on('state', (v) => {
    c.view = v;
    play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Stratégie simple et agressive (pour finir vite) : relancer au max une fois sur deux, ne jamais tirer, répartir équitablement. */
function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing') return;
  const h = v.hand;
  if (v.interlude?.needsGift && v.interlude.playerId === v.me) {
    // Un jeton à chacun tant qu'il en reste (les joueurs à sec d'abord), comme l'exige la règle.
    const rec = v.players.filter((p) => p.status === 'playing').sort((x, y) => x.chips - y.chips);
    const alloc = {};
    for (let left = v.interlude.surplus, i = 0; left > 0; left--, i++) {
      const id = rec[i % rec.length].id;
      alloc[id] = (alloc[id] ?? 0) + 1;
    }
    c.socket.emit('game:gift', { allocation: alloc }, () => {});
    return;
  }
  if (!h || h.turnId !== v.me || v.interlude) return;
  if (h.street === 'snipe') c.socket.emit('game:snipe', { pass: true }, () => {});
  else if (h.options) {
    const o = h.options;
    const action = o.canRaise && Math.random() < 0.5 ? { type: 'raise', amount: o.maxRaise } : { type: o.canCheck ? 'check' : 'call' };
    c.socket.emit('game:action', action, () => {});
  }
}

const a = client('Alice');
const b = client('Bob');
await new Promise((r) => a.socket.on('connect', r));
await new Promise((r) => (b.socket.connected ? r() : b.socket.on('connect', r)));

const created = await a.call('room:create', { name: 'Alice', avatar: '🦊' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: '🐺' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
b.session = joined.data;
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail("un invité ne devrait pas pouvoir lancer la partie");
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 4 joueurs`);

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place.
await new Promise((r) => setTimeout(r, 1500));
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 800));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...b.session, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== b.session.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

// Les cartes privées des autres ne doivent jamais fuiter.
let leaks = 0;
for (const c of [a, b2]) {
  c.socket.on('state', (v) => {
    for (const p of v.players) {
      if (p.id !== v.me && p.hole && !(v.hand?.street === 'result' && v.hand.result?.entries.some((e) => e.id === p.id))) leaks++;
    }
  });
}

await new Promise((resolve) => {
  let ticks = 0;
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    } else if (++ticks % 75 === 0 && a.view) {
      const chips = a.view.players.map((p) => `${p.name}:${p.status === 'playing' ? p.chips : p.status}`).join(' ');
      console.log(`  … manche ${a.view.hand?.number ?? '?'} — ${chips}`);
    }
  }, 200);
});
const final = a.view.final;
if (leaks > 0) fail(`${leaks} fuite(s) de cartes privées`);
if (final.filter((f) => f.eliminated).length !== 1) fail('il doit y avoir exactement un éliminé');
if (final.filter((f) => !f.eliminated).length !== 3) fail('il doit y avoir 3 survivants');
console.log(`✓ partie terminée en ${a.view.log.filter((l) => l.kind === 'hand' && l.text.startsWith('Manche')).length}+ manches — éliminé : ${final.find((f) => f.eliminated).name}`);

const restarted = await a.call('game:restart');
if (!restarted.ok || a.view.phase !== 'lobby') await new Promise((r) => setTimeout(r, 300));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
