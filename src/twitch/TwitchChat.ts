import { GAME_CONFIG } from '../core/config';

export interface TwitchChatEvent {
  username: string;
  chatterId: string;
  text: string;
}

export type TwitchConnectionState = 'disconnected' | 'connecting' | 'connected';
type StatusCallback = (message: string, state: TwitchConnectionState) => void;

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
const AUTH_STATE_KEY = 'dead-circuit-oauth-state';
const CLIENT_ID_KEY = 'dead-circuit-client-id';

export class TwitchChat {
  private token: string | null = null;
  private clientId: string | null = null;
  private userId: string | null = null;
  private activeSocket: WebSocket | null = null;
  private pendingSocket: WebSocket | null = null;
  private intentionalClose = false;
  private reconnectTimer: number | null = null;
  private validationTimer: number | null = null;
  private reconnectCount = 0;
  private handledIds = new Set<string>();
  private lastGlobalCommandAt = 0;
  private lastRateLimitNoticeAt = 0;
  private viewerCommandTimes = new Map<string, number>();
  private keepaliveTimers = new Map<WebSocket, number>();
  private keepaliveTimeouts = new Map<WebSocket, number>();

  constructor(
    private readonly onChat: (event: TwitchChatEvent) => void,
    private readonly onStatus: StatusCallback,
    private readonly onChatter: (chatterId: string) => void = () => undefined,
    private readonly onNotice: (message: string) => void = () => undefined,
  ) {}

  connect(clientId: string): void {
    const cleanId = clientId.trim();
    if (!cleanId) throw new Error('Enter your Twitch Client ID first.');
    this.onStatus('Opening Twitch authorization…', 'connecting');
    const state = crypto.randomUUID();
    sessionStorage.setItem(AUTH_STATE_KEY, state);
    sessionStorage.setItem(CLIENT_ID_KEY, cleanId);
    const redirectUri = `${location.origin}${location.pathname}`;
    const query = new URLSearchParams({
      client_id: cleanId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'user:read:chat',
      state,
      force_verify: 'true',
    });
    location.assign(`https://id.twitch.tv/oauth2/authorize?${query.toString()}`);
  }

  async completeOAuthIfPresent(fallbackClientId = ''): Promise<boolean> {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('access_token');
    if (!token) {
      const oauthError = new URLSearchParams(location.search).get('error');
      if (oauthError) {
        history.replaceState(null, '', `${location.pathname}`);
        this.onStatus('Twitch authorization was not completed. Demo mode is still available.', 'disconnected');
        return true;
      }
      return false;
    }
    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem(AUTH_STATE_KEY);
    const clientId = sessionStorage.getItem(CLIENT_ID_KEY) || fallbackClientId.trim();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    sessionStorage.removeItem(AUTH_STATE_KEY);
    if (!expectedState || returnedState !== expectedState || !clientId) {
      this.onStatus('Twitch authorization did not match this session. Try connecting again.', 'disconnected');
      return true;
    }
    try {
      this.onStatus('Checking Twitch authorization…', 'connecting');
      const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!response.ok) throw new Error(`Twitch authorization check failed (${response.status}).`);
      const validated = await response.json() as ValidatedToken;
      if (validated.client_id !== clientId) throw new Error('This Twitch token belongs to a different app Client ID.');
      if (!validated.scopes.includes('user:read:chat')) throw new Error('Twitch chat permission was not granted. Connect again and approve chat access.');
      if (!validated.user_id || !validated.login) throw new Error('Twitch did not return the broadcaster account for this token.');
      this.token = token;
      this.clientId = clientId;
      this.userId = validated.user_id;
      this.validationTimer = window.setInterval(() => void this.validateActiveToken(), 60 * 60 * 1000);
      this.onStatus(`Connecting to @${validated.login} chat…`, 'connecting');
      await this.openEventSub(EVENTSUB_URL, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Twitch connection failed.';
      if (this.token) this.endSession(message);
      else this.onStatus(message, 'disconnected');
    }
    return true;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.validationTimer !== null) window.clearInterval(this.validationTimer);
    this.reconnectTimer = null;
    this.validationTimer = null;
    this.clearAllKeepaliveTimers();
    this.activeSocket?.close();
    this.pendingSocket?.close();
    this.activeSocket = null;
    this.pendingSocket = null;
    this.token = null;
    this.clientId = null;
    this.userId = null;
    this.handledIds.clear();
    this.viewerCommandTimes.clear();
    this.onStatus('DEMO MODE', 'disconnected');
  }

  private async validateActiveToken(): Promise<void> {
    if (!this.token || !this.clientId) return;
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.token}` } });
      if (response.status === 401) {
        this.endSession('Twitch authorization expired or was revoked. Reconnect to continue.');
        return;
      }
      if (!response.ok) {
        this.onStatus('Twitch token check is temporarily unavailable; chat remains connected.', this.activeSocket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting');
        return;
      }
      const validated = await response.json() as ValidatedToken;
      if (validated.client_id !== this.clientId || !validated.scopes.includes('user:read:chat')) {
        this.endSession('Twitch chat permission is no longer available. Reconnect to continue.');
      }
    } catch {
      this.onStatus('Twitch token check is temporarily unavailable; chat remains connected.', this.activeSocket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting');
    }
  }

  private endSession(message: string): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearAllKeepaliveTimers();
    this.activeSocket?.close();
    this.pendingSocket?.close();
    this.token = null;
    this.activeSocket = null;
    this.pendingSocket = null;
    if (this.validationTimer !== null) window.clearInterval(this.validationTimer);
    this.validationTimer = null;
    this.handledIds.clear();
    this.viewerCommandTimes.clear();
    this.onStatus(message, 'disconnected');
  }

  private async openEventSub(url: string, transferred: boolean, oldSocket: WebSocket | null = null): Promise<void> {
    if (!this.token || !this.clientId || !this.userId) return;
    if (this.pendingSocket && this.pendingSocket.readyState < WebSocket.CLOSING) return;
    if (!transferred && this.activeSocket?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    const socket = new WebSocket(url);
    this.pendingSocket = socket;
    socket.onmessage = async (message) => {
      let packet: EventSubPacket;
      try { packet = JSON.parse(String(message.data)) as EventSubPacket; }
      catch { return; }
      const type = packet.metadata?.message_type;
      if (type === 'session_welcome') {
        this.armKeepalive(socket, packet.payload.session.keepalive_timeout_seconds ?? 0);
      } else {
        this.refreshKeepalive(socket);
      }
      if (type === 'session_welcome') {
        if (this.pendingSocket !== socket || !this.token || socket.readyState !== WebSocket.OPEN) return;
        if (!transferred) {
          try {
            await this.subscribe(packet.payload.session.id);
          } catch (error) {
            if (error instanceof TwitchRequestError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
              this.endSession(error.message);
              return;
            }
            this.onStatus(`${error instanceof Error ? error.message : 'Could not subscribe to chat.'} Retrying…`, 'connecting');
            socket.close();
            return;
          }
        }
        if (this.pendingSocket !== socket || !this.token || socket.readyState !== WebSocket.OPEN) return;
        this.activeSocket = socket;
        this.pendingSocket = null;
        this.reconnectCount = 0;
        if (transferred) oldSocket?.close(1000, 'EventSub session transferred');
        this.onStatus('TWITCH CHAT CONNECTED', 'connected');
      } else if (type === 'session_reconnect') {
        const reconnectUrl = packet.payload.session.reconnect_url;
        if (reconnectUrl && this.pendingSocket === null) {
          this.onStatus('Twitch is transferring chat to a replacement connection…', 'connecting');
          this.clearKeepalive(socket);
          void this.openEventSub(reconnectUrl, true, socket);
        } else if (!reconnectUrl) {
          socket.close();
        }
      } else if (type === 'notification' && packet.payload?.event) {
        this.handleChatEvent(packet.metadata.message_id, packet.payload.event);
      } else if (type === 'revocation') {
        this.endSession('Twitch chat permission was revoked. Reconnect to continue.');
      }
    };
    socket.onerror = () => this.onStatus('Twitch chat connection error. Retrying…', 'connecting');
    socket.onclose = () => {
      this.clearKeepalive(socket);
      const wasActive = this.activeSocket === socket;
      const wasPending = this.pendingSocket === socket;
      if (!wasActive && !wasPending) return;
      if (wasActive) this.activeSocket = null;
      if (wasPending) this.pendingSocket = null;
      if (this.intentionalClose || !this.token) return;
      if (this.activeSocket?.readyState === WebSocket.OPEN) {
        this.onStatus('TWITCH CHAT CONNECTED', 'connected');
        return;
      }
      if (this.pendingSocket && this.pendingSocket.readyState < WebSocket.CLOSING) {
        this.onStatus('Twitch chat is reconnecting…', 'connecting');
        return;
      }
      this.onStatus('Twitch chat disconnected. Reconnecting…', 'connecting');
      this.scheduleReconnect();
    };
  }

  private armKeepalive(socket: WebSocket, timeoutSeconds: number | undefined): void {
    if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) return;
    this.keepaliveTimeouts.set(socket, timeoutSeconds);
    this.refreshKeepalive(socket);
  }

  private refreshKeepalive(socket: WebSocket): void {
    const timeoutSeconds = this.keepaliveTimeouts.get(socket);
    if (!timeoutSeconds) return;
    const oldTimer = this.keepaliveTimers.get(socket);
    if (oldTimer !== undefined) window.clearTimeout(oldTimer);
    const timer = window.setTimeout(() => {
      this.keepaliveTimers.delete(socket);
      if (this.activeSocket !== socket && this.pendingSocket !== socket) return;
      this.onStatus('Twitch chat heartbeat timed out. Reconnecting…', 'connecting');
      socket.close();
    }, (timeoutSeconds + 1) * 1000);
    this.keepaliveTimers.set(socket, timer);
  }

  private clearKeepalive(socket: WebSocket): void {
    const timer = this.keepaliveTimers.get(socket);
    if (timer !== undefined) window.clearTimeout(timer);
    this.keepaliveTimers.delete(socket);
    this.keepaliveTimeouts.delete(socket);
  }

  private clearAllKeepaliveTimers(): void {
    for (const timer of this.keepaliveTimers.values()) window.clearTimeout(timer);
    this.keepaliveTimers.clear();
    this.keepaliveTimeouts.clear();
  }

  private async subscribe(sessionId: string): Promise<void> {
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Client-Id': this.clientId!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: this.userId, user_id: this.userId },
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new TwitchRequestError(body.message || `Twitch chat subscription failed (${response.status}).`, response.status);
    }
  }

  private handleChatEvent(messageId: string | undefined, event: ChatMessageEvent): void {
    if (messageId && this.handledIds.has(messageId)) return;
    if (messageId) {
      this.handledIds.add(messageId);
      if (this.handledIds.size > 500) this.handledIds = new Set(Array.from(this.handledIds).slice(-250));
    }
    if (event.chatter_user_id) this.onChatter(event.chatter_user_id);
    const text = event.message?.text?.trim() ?? '';
    if (!(/^(?:!b\d+\s+wire\b|!repair(?:\s|$))/i.test(text))) return;
    const now = Date.now();
    const chatterId = event.chatter_user_id;
    if (!chatterId) return;
    const username = event.chatter_user_login || chatterId;
    if (this.viewerCommandTimes.size > 5000) {
      for (const [id, usedAt] of this.viewerCommandTimes) if (now - usedAt > 850) this.viewerCommandTimes.delete(id);
    }
    const previous = this.viewerCommandTimes.get(chatterId) ?? 0;
    if (now - previous < GAME_CONFIG.CHAT_COMMAND_COOLDOWN_SECONDS * 1000) {
      this.notifyRateLimit(`@${username}: wait before placing another wire.`);
      return;
    }
    if (now - this.lastGlobalCommandAt < 50) {
      this.notifyRateLimit('Chat is sending commands too quickly; this placement was skipped.');
      return;
    }
    this.viewerCommandTimes.set(chatterId, now);
    this.lastGlobalCommandAt = now;
    this.onChat({ username, chatterId, text });
  }

  private notifyRateLimit(message: string): void {
    const now = Date.now();
    if (now - this.lastRateLimitNoticeAt < 1800) return;
    this.lastRateLimitNoticeAt = now;
    this.onNotice(message);
  }

  private scheduleReconnect(): void {
    if (!this.token || this.intentionalClose || this.reconnectTimer !== null) return;
    const delay = Math.min(15000, 1000 * 2 ** this.reconnectCount++);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openEventSub(EVENTSUB_URL, false);
    }, delay);
  }
}

interface EventSubPacket {
  metadata: { message_id: string; message_type: string };
  payload: { session: { id: string; reconnect_url?: string; keepalive_timeout_seconds?: number }; event?: ChatMessageEvent };
}

class TwitchRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

interface ValidatedToken {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[];
  expires_in: number;
}

interface ChatMessageEvent {
  chatter_user_id?: string;
  chatter_user_login?: string;
  message?: { text?: string };
}
