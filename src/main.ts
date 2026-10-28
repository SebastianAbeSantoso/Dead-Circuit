import Phaser from 'phaser';
import { createCampaign, decodeCampaign, decodeSettings, nextCampaignMission, recordMissionResult, CAMPAIGN_STORAGE_KEY, SETTINGS_STORAGE_KEY, type CampaignSave, type DisplaySettings } from './core/campaign';
import type { LevelId } from './core/game';
import { GameScene } from './game/GameScene';
import { TwitchChat, type TwitchConnectionState } from './twitch/TwitchChat';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const connectDialog = $('connect-dialog') as HTMLDialogElement;
const settingsDialog = $('settings-dialog') as HTMLDialogElement;
const newSaveDialog = $('new-save-dialog') as HTMLDialogElement;
const clientIdInput = $('client-id-input') as HTMLInputElement;
const connectError = $('connect-error');
const menuScreen = $('menu-screen');
const resultScreen = $('result-screen');
const continueButton = $('continue-button') as HTMLButtonElement;
const newSaveButton = $('new-save-button') as HTMLButtonElement;
const connectButton = $('connect-button') as HTMLButtonElement;
const replayList = $('replay-list');
const envClientId = import.meta.env.VITE_TWITCH_CLIENT_ID ?? '';
clientIdInput.value = envClientId;

const scene = new GameScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1600,
  height: 900,
  backgroundColor: '#080d14',
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1600, height: 900 },
  scene: [scene],
});

let campaign = loadCampaign();
let settings = loadSettings();
let toastTimer = 0;
let twitchState: TwitchConnectionState = 'disconnected';
const toast = $('event-toast');
const reduceMotionInput = $('reduced-motion') as HTMLInputElement;
const screenShakeInput = $('screen-shake') as HTMLInputElement;
const uiScaleInput = $('ui-scale') as HTMLInputElement;

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { showToast('Browser storage is unavailable. Progress will last for this session only.', false); }
}

function loadCampaign(): CampaignSave | null {
  return decodeCampaign(readStorage(CAMPAIGN_STORAGE_KEY));
}

function loadSettings(): DisplaySettings {
  return decodeSettings(readStorage(SETTINGS_STORAGE_KEY));
}

function saveCampaign(): void {
  if (campaign) writeStorage(CAMPAIGN_STORAGE_KEY, campaign);
  updateMenuActions();
}

function saveSettings(): void {
  writeStorage(SETTINGS_STORAGE_KEY, settings);
  applySettings();
}

function applySettings(): void {
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
  document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  scene.setDisplaySettings(settings);
  uiScaleInput.value = String(settings.uiScale);
  $('ui-scale-value').textContent = `${Math.round(settings.uiScale * 100)}%`;
  reduceMotionInput.checked = settings.reducedMotion;
  screenShakeInput.checked = settings.screenShake;
}

function updateMenuActions(): void {
  const hasCampaign = Boolean(campaign);
  continueButton.hidden = !hasCampaign;
  newSaveButton.textContent = hasCampaign ? 'NEW SAVE' : 'START STANDARD ROUTING';
  newSaveButton.classList.toggle('action-primary', !hasCampaign);
  newSaveButton.classList.toggle('action-secondary', hasCampaign);
}

function setScreen(screen: 'menu' | 'play' | 'result'): void {
  menuScreen.hidden = screen !== 'menu';
  resultScreen.hidden = screen !== 'result';
  document.body.classList.toggle('is-playing', screen === 'play');
  if (screen !== 'menu') replayList.hidden = true;
}

function startMission(mission: LevelId): void {
  if (!campaign) campaign = createCampaign();
  saveCampaign();
  setScreen('play');
  scene.startRun(mission);
}

function continueCampaign(): void {
  if (!campaign) return;
  const next = nextCampaignMission(campaign);
  if (next === 'replay') {
    replayList.hidden = false;
    replayList.querySelector<HTMLButtonElement>('[data-replay="standard"]')?.focus();
    return;
  }
  startMission(next);
}

function startNewCampaign(): void {
  campaign = createCampaign();
  saveCampaign();
  startMission('standard');
}

function returnToMenu(): void {
  setScreen('menu');
  updateMenuActions();
  (campaign ? $('continue-button') : $('new-save-button')).focus();
}

function showResult(mission: LevelId, won: boolean, summary: string): void {
  const next = $('result-primary') as HTMLButtonElement;
  $('result-title').textContent = won ? 'CREW EXTRACTION' : 'SORTIE LOST';
  $('result-title').classList.toggle('is-loss', !won);
  $('result-kicker').textContent = won ? 'FLIGHT REPORT / COMPLETE' : 'FLIGHT REPORT / SYSTEMS DOWN';
  $('result-copy').textContent = `${summary} ${campaign?.completedMissions.length ?? 0}/2 missions secured.`;
  if (!won) {
    next.textContent = 'RETRY THIS SORTIE';
    next.onclick = () => startMission(mission);
  } else if (mission === 'standard') {
    next.textContent = 'CONTINUE TO AND-GATE ROUTING';
    next.onclick = () => startMission('logic');
  } else {
    next.textContent = 'CHOOSE A MISSION TO REPLAY';
    next.onclick = () => {
      setScreen('menu');
      updateMenuActions();
      replayList.hidden = false;
      replayList.querySelector<HTMLButtonElement>('[data-replay="standard"]')?.focus();
    };
  }
  setScreen('result');
  next.focus();
}

function showToast(message: string, good: boolean): void {
  if (!message) return;
  toast.textContent = message;
  toast.dataset.tone = good ? 'good' : 'caution';
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3000);
}

function updateConnection(message: string, state: TwitchConnectionState): void {
  twitchState = state;
  const status = $('menu-channel-status');
  status.textContent = state === 'connected' ? 'CHANNEL / TWITCH CONNECTED' : state === 'connecting' ? 'CHANNEL / CONNECTING' : 'CHANNEL / DEMO MODE';
  status.dataset.state = state;
  connectButton.textContent = state === 'connected' ? 'DISCONNECT TWITCH' : state === 'connecting' ? 'CONNECTING…' : 'CONNECT TWITCH CHANNEL';
  connectButton.disabled = state === 'connecting';
  scene.setTwitchStatus(message, state);
}

function requestConnect(): void {
  connectError.textContent = '';
  if (envClientId.trim()) {
    clientIdInput.value = envClientId.trim();
    try { twitch.connect(envClientId); }
    catch (error) {
      connectError.textContent = error instanceof Error ? error.message : 'Could not start Twitch authorization.';
      connectDialog.showModal();
    }
  } else {
    connectDialog.showModal();
    clientIdInput.focus();
  }
}

const twitch = new TwitchChat(
  ({ username, chatterId, text }) => scene.submitWire(text, username, chatterId),
  updateConnection,
  (chatterId) => scene.noteChatter(chatterId),
  (message) => showToast(message, false),
);

scene.onConnectRequest = requestConnect;
scene.onDisconnectRequest = () => twitch.disconnect();
scene.onEvent = showToast;
scene.onRoundEnd = (mission, won, summary) => {
  if (campaign) campaign = recordMissionResult(campaign, mission, won);
  saveCampaign();
  showResult(mission, won, summary);
};

applySettings();
updateMenuActions();
setScreen('menu');

$('continue-button').addEventListener('click', continueCampaign);
newSaveButton.addEventListener('click', () => {
  if (campaign) newSaveDialog.showModal();
  else startNewCampaign();
});
$('confirm-new-save').addEventListener('click', (event) => {
  event.preventDefault();
  newSaveDialog.close();
  startNewCampaign();
});
$('settings-button').addEventListener('click', () => settingsDialog.showModal());
connectButton.addEventListener('click', () => {
  if (twitchState === 'connected') twitch.disconnect();
  else if (twitchState === 'disconnected') requestConnect();
});
$('result-menu').addEventListener('click', returnToMenu);
replayList.querySelectorAll<HTMLButtonElement>('[data-replay]').forEach((button) => {
  button.addEventListener('click', () => startMission(button.dataset.replay as LevelId));
});

$('authorize-button').addEventListener('click', (event) => {
  event.preventDefault();
  connectError.textContent = '';
  try { twitch.connect(clientIdInput.value); }
  catch (error) { connectError.textContent = error instanceof Error ? error.message : 'Could not start Twitch authorization.'; }
});

connectDialog.addEventListener('click', (event) => { if (event.target === connectDialog) connectDialog.close(); });
$('ui-scale').addEventListener('input', () => {
  settings.uiScale = Number(uiScaleInput.value);
  applySettings();
});
$('ui-scale').addEventListener('change', saveSettings);
reduceMotionInput.addEventListener('change', () => { settings.reducedMotion = reduceMotionInput.checked; saveSettings(); });
screenShakeInput.addEventListener('change', () => { settings.screenShake = screenShakeInput.checked; saveSettings(); });
$('fullscreen-button').addEventListener('click', () => {
  const message = $('settings-message');
  message.textContent = '';
  try {
    if (game.scale.isFullscreen) game.scale.stopFullscreen();
    else game.scale.startFullscreen();
  } catch {
    message.textContent = 'Fullscreen is unavailable in this browser window.';
  }
});
game.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, () => { $('settings-message').textContent = 'Fullscreen was blocked by the browser. Try again from this page.'; });
const updateFullscreenLabel = () => { $('fullscreen-button').textContent = game.scale.isFullscreen ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'; };
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, updateFullscreenLabel);
game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, updateFullscreenLabel);

void twitch.completeOAuthIfPresent(envClientId);
window.addEventListener('beforeunload', () => game.destroy(true));
