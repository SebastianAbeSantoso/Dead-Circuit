import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import { LEVELS, type LevelId } from './core/game';
import { TwitchChat, type TwitchConnectionState } from './twitch/TwitchChat';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const connectDialog = $('connect-dialog') as HTMLDialogElement;
const clientIdInput = $('client-id-input') as HTMLInputElement;
const connectError = $('connect-error');
const envClientId = import.meta.env.VITE_TWITCH_CLIENT_ID ?? '';
clientIdInput.value = envClientId;

const scene = new GameScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1240,
  height: 760,
  backgroundColor: '#0a111b',
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1240, height: 760 },
  scene: [scene],
});

const overlay = $('round-overlay');
const overlayTitle = $('overlay-title');
const overlayCopy = $('overlay-copy');
const gameFrame = document.querySelector('.game-frame') as HTMLElement;

/** emil-design-eng: screen shake on hit — transient, interruptible, then cleanup. */
function shakeGameFrame(): void {
  gameFrame.classList.add('shake');
  setTimeout(() => gameFrame.classList.remove('shake'), 400);
}

/** @starting-style fallback for browsers that don't support it (Safari, older Chrome). */
function applyStartingStyleFallback(): void {
  if (CSS.supports('starting-style: 0')) return;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const el = mutation.target as HTMLElement;
        if (el.classList.contains('round-overlay') && !el.classList.contains('hidden')) {
          const card = el.querySelector('.overlay-card') as HTMLElement | null;
          if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.94)';
            requestAnimationFrame(() => {
              card.style.opacity = '1';
              card.style.transform = 'scale(1)';
            });
          }
        }
      }
    }
  });
  observer.observe(overlay, { attributes: true, subtree: false });
}

applyStartingStyleFallback();
const startButtons: Array<[LevelId, HTMLButtonElement]> = [
  ['standard', $('start-standard') as HTMLButtonElement],
  ['logic', $('start-logic') as HTMLButtonElement],
];
const dangerValue = $('danger-value');
const dangerFill = $('danger-fill');
const boardStatus = $('board-status');
const boardList = $('board-list');
const feed = $('event-feed');
let feedItems: string[] = [];
let lastBoardSignature = '';

function addFeed(message: string, good: boolean): void {
  feedItems.unshift(`${good ? '✓' : '!' } ${message}`);
  feedItems = feedItems.slice(0, 3);
  feed.replaceChildren(...feedItems.map((item) => {
    const line = document.createElement('p');
    line.textContent = item;
    return line;
  }));
  // emil-design-eng: transient screen shake on hit — immediate, bounded, cleans up
  if (message.startsWith('IMPACT')) shakeGameFrame();
}

scene.onEvent = addFeed;
scene.onState = (state) => {
  const level = LEVELS[state.levelId];
  $('mission-label').textContent = `ROUTING TEMPLATE / ${level.title.toUpperCase()}`;
  $('mission-copy').textContent = `Chat shares the selected routing board by default. Choose another board below or target it with !bN. Pilot through the bullet patterns; power every board, then reach the exit.`;
  dangerValue.textContent = `${Math.round(state.danger)}%`;
  (dangerFill as HTMLElement).style.width = `${state.danger}%`;
  (dangerFill as HTMLElement).classList.toggle('critical', state.danger > 68);
  boardStatus.textContent = `${state.boards.length} / ${state.boardCapacity} boards · ${state.activeChatterCount} unique active chatters`;
  const boardSignature = `${scene.getDisplayedBoardId() ?? ''}|${state.boards.map((board) => {
    const recent = board.lastActivityAt !== null && Date.now() - board.lastActivityAt < 30_000;
    return `${board.id}:${board.levelId}:${board.solved}:${board.placementCount}:${recent}`;
  }).join('|')}`;
  if (boardSignature !== lastBoardSignature) {
    lastBoardSignature = boardSignature;
    boardList.replaceChildren(...state.boards.map((board) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.dataset.boardId = String(board.id);
      chip.className = `board-chip board-select${board.solved ? ' online' : ''}${scene.getDisplayedBoardId() === board.id ? ' selected' : ''}`;
      chip.title = `Show B${board.id} in the routing panel`;
      const recent = board.lastActivityAt !== null && Date.now() - board.lastActivityAt < 30_000;
      chip.textContent = `B${board.id} · ${board.levelId === 'logic' ? 'AND' : 'STANDARD'} · ${board.solved ? 'ONLINE' : 'ROUTE PENDING'} · ${board.placementCount} ${board.placementCount === 1 ? 'move' : 'moves'} · ${recent ? 'ACTIVE' : 'QUIET'}`;
      return chip;
    }));
  }
  (['simulate-100-chatters', 'simulate-1000-chatters', 'simulate-10000-chatters'] as const).forEach((id) => {
    ($(id) as HTMLButtonElement).disabled = state.phase !== 'playing';
  });
  ($('simulate-hit') as HTMLButtonElement).disabled = state.phase !== 'playing';
  if (state.phase === 'won' || state.phase === 'lost') {
    overlay.classList.remove('hidden');
    overlayTitle.textContent = state.phase === 'won' ? 'Crew extraction complete.' : 'The circuit went dark.';
    const shorts = state.boards.reduce((total, board) => total + board.shorts, 0);
    overlayCopy.textContent = `${state.lastEvent} Run time ${Math.floor(state.elapsed)}s · Shorts ${shorts} · Boards ${state.boards.filter((board) => board.solved).length}/${state.boards.length}.`;
  }
};

startButtons.forEach(([levelId, button]) => button.addEventListener('click', () => {
  scene.startRun(levelId);
  overlay.classList.add('hidden');
}));

$('demo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('demo-command') as HTMLInputElement;
  if (!input.value.trim()) return;
  scene.submitWire(input.value, 'DEMO');
  input.value = '';
  input.focus();
});

const twitch = new TwitchChat(
  ({ username, text }) => scene.submitWire(text, username),
  (message, connectionState: TwitchConnectionState) => {
    $('connection-label').textContent = message;
    const connected = connectionState === 'connected';
    const canDisconnect = connectionState !== 'disconnected';
    $('connection-dot').classList.toggle('is-connected', connected);
    $('connect-button').classList.toggle('hidden', canDisconnect);
    $('disconnect-button').classList.toggle('hidden', !canDisconnect);
    if (message !== 'DEMO MODE') addFeed(message, connected);
  },
  (chatterId) => scene.noteChatter(chatterId),
  (message) => addFeed(message, false),
);

$('simulate-100-chatters').addEventListener('click', () => scene.simulateChatters(100));
$('simulate-1000-chatters').addEventListener('click', () => scene.simulateChatters(1000));
$('simulate-10000-chatters').addEventListener('click', () => scene.simulateChatters(10000));
boardList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-board-id]');
  if (button) scene.selectBoard(Number(button.dataset.boardId));
});
$('simulate-hit').addEventListener('click', () => scene.simulateHit());
const testFeaturesPanel = $('test-features-panel') as HTMLDetailsElement;
const testFeaturesToggle = $('test-features-toggle') as HTMLButtonElement;
testFeaturesToggle.addEventListener('click', () => {
  testFeaturesPanel.open = !testFeaturesPanel.open;
  testFeaturesToggle.setAttribute('aria-expanded', String(testFeaturesPanel.open));
  testFeaturesToggle.textContent = testFeaturesPanel.open ? 'Hide test features' : 'Test features';
});

$('connect-button').addEventListener('click', () => {
  connectError.textContent = '';
  if (envClientId.trim()) {
    clientIdInput.value = envClientId.trim();
    try { twitch.connect(envClientId); }
    catch (error) { connectError.textContent = error instanceof Error ? error.message : 'Could not start Twitch authorization.'; connectDialog.showModal(); }
  } else {
    connectDialog.showModal();
    clientIdInput.focus();
  }
});

$('authorize-button').addEventListener('click', (event) => {
  event.preventDefault();
  connectError.textContent = '';
  try { twitch.connect(clientIdInput.value); }
  catch (error) { connectError.textContent = error instanceof Error ? error.message : 'Could not start Twitch authorization.'; }
});

$('disconnect-button').addEventListener('click', () => twitch.disconnect());
connectDialog.addEventListener('click', (event) => {
  if (event.target === connectDialog) connectDialog.close();
});

void twitch.completeOAuthIfPresent(envClientId);

window.addEventListener('beforeunload', () => game.destroy(true));
