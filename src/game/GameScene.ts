import Phaser from 'phaser';
import {
  beginRound, computePlaneMultipliers, createInitialState, FLIGHT_ARENA, noteActiveChatter,
  parseRepairCommand, parseWireCommand, PART_IDS, PART_LABELS, placeWire, repairPart,
  simulatePilotHit, updateRound, type CircuitBoard, type GameState, type PartId, type PartLevel,
} from '../core/multiGame';
import { BOARD_SIZE, LEVELS, cellKey, type Cell, type Direction, type LevelId, type TileKind } from '../core/game';
import { GAME_CONFIG } from '../core/config';

const WIDTH = 1600;
const HEIGHT = 900;
const CELL = 74;
const BOARD_Y = 300;
const BOARD_ORIGIN_X = 82;
const PART_WIDTH = 210;
const PART_HEIGHT = 58;
const PART_GAP = 10;
const FONT_DISPLAY = 'Barlow Condensed, Arial Narrow, sans-serif';
const FONT_DATA = 'DM Mono, Consolas, monospace';
const PORTS: Record<TileKind, string[]> = { H: ['E', 'W'], V: ['N', 'S'], NE: ['N', 'E'], ES: ['E', 'S'], SW: ['S', 'W'], WN: ['W', 'N'] };

const PART_COLORS = [
  { fill: 0x0d1a1c, ring: 0x6ef0d6, text: '#c9fff4' },
  { fill: 0x1a1408, ring: 0xf3c575, text: '#f3c575' },
  { fill: 0x1a0808, ring: 0xff5f52, text: '#ff5f52' },
  { fill: 0x0a0505, ring: 0x332222, text: '#553333' },
] as const;
const PART_STATES = ['OPERATIONAL', 'DAMAGED', 'CRITICAL', 'DESTROYED'] as const;

interface PartWidget {
  id: PartId;
  root: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  flash: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  level: PartLevel;
}

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialState();
  private graphics!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private heading!: Phaser.GameObjects.Text;
  private subheading!: Phaser.GameObjects.Text;
  private boardTitle!: Phaser.GameObjects.Text;
  private boardPage!: Phaser.GameObjects.Text;
  private repairStatus!: Phaser.GameObjects.Text;
  private twitchStatus!: Phaser.GameObjects.Text;
  private exitText!: Phaser.GameObjects.Text;
  private boardLabels: Phaser.GameObjects.Text[] = [];
  private boardSignature = '';
  private focusedBoardId: number | null = null;
  private simulatedChatter = 0;
  private pendingChatters = new Set<string>();
  private pendingCommands: Array<{ raw: string; owner: string; actorId: string }> = [];
  private pendingPilotHits = 0;
  private partWidgets = new Map<PartId, PartWidget>();
  private lastDraw = 0;
  private lastReportedEvent = '';
  private reducedMotion = false;
  private displaySettingsApplied = false;
  private screenShakeEnabled = true;
  private resizeHandler!: (size: Phaser.Structs.Size) => void;
  private motionQuery?: MediaQueryList;
  public onEvent: (message: string, good: boolean) => void = () => undefined;
  public onRoundEnd: (levelId: LevelId, won: boolean, summary: string) => void = () => undefined;
  public onConnectRequest: () => void = () => undefined;
  public onDisconnectRequest: () => void = () => undefined;

  constructor() { super('Game'); }

  create(): void {
    this.graphics = this.add.graphics().setDepth(0);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.add.text(66, 46, 'DEAD CIRCUIT', { fontFamily: FONT_DISPLAY, fontSize: '38px', color: '#dbe9ee', fontStyle: 'bold', letterSpacing: 3 }).setOrigin(0, 0.5).setDepth(3);
    this.heading = this.add.text(68, 91, '', { fontFamily: FONT_DISPLAY, fontSize: '21px', color: '#6ef0d6', fontStyle: 'bold', letterSpacing: 1.5 }).setOrigin(0, 0.5).setDepth(3);
    this.subheading = this.add.text(68, 122, '', { fontFamily: FONT_DATA, fontSize: '12px', color: '#93a8b6', letterSpacing: 0.5 }).setOrigin(0, 0.5).setDepth(3);
    this.add.text(BOARD_ORIGIN_X, 229, 'POWER ROUTING', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#6ef0d6', fontStyle: 'bold', letterSpacing: 2 }).setOrigin(0, 0.5).setDepth(3);
    this.boardTitle = this.add.text(BOARD_ORIGIN_X, 251, '', { fontFamily: FONT_DATA, fontSize: '12px', color: '#dbe9ee', letterSpacing: 0.6 }).setOrigin(0, 0.5).setDepth(3);
    this.boardPage = this.add.text(632, 229, '', { fontFamily: FONT_DATA, fontSize: '11px', color: '#93a8b6' }).setOrigin(0.5, 0.5).setDepth(3);
    this.repairStatus = this.add.text(711, 630, '', { fontFamily: FONT_DATA, fontSize: '10px', color: '#6ef0d6' }).setOrigin(1, 0.5).setDepth(3);
    this.exitText = this.add.text(FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2, FLIGHT_ARENA.y + 29, 'EXIT LOCKED', { fontFamily: FONT_DATA, fontSize: '11px', color: '#ffd17d', fontStyle: 'bold', letterSpacing: 1.5 }).setOrigin(0.5, 0.5).setDepth(3);
    this.twitchStatus = this.add.text(1164, 45, 'DEMO MODE', { fontFamily: FONT_DATA, fontSize: '11px', color: '#f3c575', letterSpacing: 1.4 }).setOrigin(1, 0.5).setDepth(3);

    this.createBoardNavigation();
    this.createPartWidgets();
    this.refreshBoardLabels();
    this.updatePartWidgets();
    this.drawBoard();

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!this.displaySettingsApplied) {
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', this.updateReducedMotion);
    }
    this.resizeHandler = (size) => {
      const zoom = Math.min(size.width / WIDTH, size.height / HEIGHT);
      this.cameras.main.setZoom(zoom || 1);
      this.cameras.main.centerOn(WIDTH / 2, HEIGHT / 2);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    this.resizeHandler(this.scale.gameSize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.motionQuery) this.motionQuery.removeEventListener('change', this.updateReducedMotion);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler);
    });
  }

  update(_time: number, deltaMs: number): void {
    this.processPendingInputs();
    const typingInDemo = document.activeElement === document.getElementById('demo-command');
    const x = (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
    const y = (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
    if (!typingInDemo && Phaser.Input.Keyboard.JustDown(this.keys.Q)) this.stepBoard(-1);
    if (!typingInDemo && Phaser.Input.Keyboard.JustDown(this.keys.E)) this.stepBoard(1);
    const length = Math.hypot(x, y) || 1;
    updateRound(this.state, deltaMs / 1000, typingInDemo ? { x: 0, y: 0 } : { x: x / length, y: y / length });
    this.consumePartEvents();
    const signature = `${this.focusedBoardId ?? ''}|${this.state.boards.map((board) => `${board.id}:${board.levelId}:${board.seed}`).join('|')}`;
    if (signature !== this.boardSignature) this.refreshBoardLabels();
    const allBoardsOnline = this.state.boards.length > 0 && this.state.boards.every((board) => board.solved);
    this.exitText.setText(allBoardsOnline ? 'EXIT OPEN · FLY NORTH' : `${this.state.boards.filter((board) => board.solved).length}/${this.state.boards.length} BOARDS ONLINE`);
    this.exitText.setColor(allBoardsOnline ? '#6ef0d6' : '#f3c575');
    if (this.state.phase === 'won' || this.state.phase === 'lost') {
      const phase = this.state.phase;
      if (this.lastReportedEvent !== `END:${phase}`) {
        this.lastReportedEvent = `END:${phase}`;
        this.onRoundEnd(this.state.levelId, phase === 'won', this.state.lastEvent);
      }
    }
    if (_time - this.lastDraw > 33) {
      this.drawBoard();
      this.lastDraw = _time;
    }
  }

  startRun(levelId: LevelId): void {
    this.state = createInitialState(levelId);
    this.focusedBoardId = null;
    this.pendingChatters.clear();
    this.pendingCommands = [];
    this.pendingPilotHits = 0;
    beginRound(this.state);
    this.refreshBoardLabels();
    this.lastReportedEvent = '';
    this.drawBoard();
  }

  submitWire(raw: string, owner: string, actorId = owner): void {
    if (this.pendingCommands.length >= 128) {
      this.notifyEvent('Command queue is full; wait a moment and try again.', false);
      return;
    }
    this.pendingCommands.push({ raw, owner, actorId });
  }

  noteChatter(chatterId: string): void {
    if (this.state.phase === 'playing' && chatterId) this.pendingChatters.add(chatterId);
  }

  simulateChatters(count: number): void {
    if (this.state.phase !== 'playing') return;
    for (let i = 0; i < count; i++) this.pendingChatters.add(`LOCAL_SIM_${++this.simulatedChatter}`);
  }

  simulateHit(): void {
    if (this.state.phase === 'playing') this.pendingPilotHits += 1;
  }

  getDisplayedBoardId(): number | null {
    const focused = this.focusedBoardId && this.state.boards.find((board) => board.id === this.focusedBoardId);
    return focused ? focused.id : this.state.boards[0]?.id ?? null;
  }

  selectBoard(boardId: number): void {
    if (!this.state.boards.some((board) => board.id === boardId)) return;
    this.focusedBoardId = boardId;
    this.refreshBoardLabels();
    this.drawBoard();
  }

  setTwitchStatus(message: string, state: 'disconnected' | 'connecting' | 'connected'): void {
    const compact = message.length > 30 ? `${message.slice(0, 27)}…` : message;
    this.twitchStatus.setText(compact.toUpperCase());
    this.twitchStatus.setColor(state === 'connected' ? '#6ef0d6' : state === 'connecting' ? '#f3c575' : '#93a8b6');
    if (message !== 'DEMO MODE') this.notifyEvent(message, state === 'connected');
  }

  setDisplaySettings(settings: { reducedMotion: boolean; screenShake: boolean }): void {
    this.displaySettingsApplied = true;
    this.reducedMotion = settings.reducedMotion;
    this.screenShakeEnabled = settings.screenShake;
    if (this.reducedMotion && this.partWidgets.size) this.clearMotionEffects();
  }

  pushNotice(message: string, good = false): void { this.notifyEvent(message, good); }

  private processPendingInputs(): void {
    let chattersProcessed = 0;
    for (const chatterId of this.pendingChatters) {
      noteActiveChatter(this.state, chatterId);
      this.pendingChatters.delete(chatterId);
      if (++chattersProcessed >= 1000) break;
    }
    const commandCount = Math.min(16, this.pendingCommands.length);
    for (let i = 0; i < commandCount; i++) {
      const command = this.pendingCommands.shift()!;
      const repair = parseRepairCommand(command.raw);
      if (repair !== null) {
        if (typeof repair === 'string') this.notifyEvent(repair, false);
        else {
          const repaired = repairPart(this.state, repair, command.actorId, command.owner);
          this.notifyEvent(this.state.lastEvent, Boolean(repaired));
        }
        continue;
      }
      const parsed = parseWireCommand(command.raw, command.owner, command.actorId);
      if (typeof parsed === 'string') {
        this.state.lastEvent = parsed;
        this.lastReportedEvent = parsed;
        this.notifyEvent(parsed, false);
        continue;
      }
      const result = placeWire(this.state, parsed);
      this.lastReportedEvent = this.state.lastEvent;
      this.notifyEvent(result.message, result.accepted && !result.short);
    }
    const hitCount = this.pendingPilotHits;
    this.pendingPilotHits = 0;
    for (let i = 0; i < hitCount; i++) simulatePilotHit(this.state);
  }

  private consumePartEvents(): void {
    if (this.state.partEvents.length === 0) return;
    const events = this.state.partEvents.splice(0);
    for (const event of events) this.animatePartChange(event.partId, event.type);
    if (events.some((event) => event.type === 'hit') && !this.reducedMotion && this.screenShakeEnabled) {
      const intensity = 0.003 * computePlaneMultipliers(this.state).shakeMult;
      this.cameras.main.shake(120, Math.min(0.012, intensity));
    }
    this.updatePartWidgets();
  }

  private notifyEvent(message: string, _good: boolean): void {
    this.onEvent(message, _good);
  }

  private updateReducedMotion = (event: MediaQueryListEvent): void => {
    if (this.displaySettingsApplied) return;
    this.reducedMotion = event.matches;
    if (this.reducedMotion) this.clearMotionEffects();
  };

  private clearMotionEffects(): void {
    this.tweens.killAll();
    for (const widget of this.partWidgets.values()) {
      widget.root.setScale(1);
      widget.flash.setAlpha(0);
      widget.status.setAlpha(1);
    }
  }

  private createBoardNavigation(): void {
    this.makeButton('‹', 525, 229, 42, 38, () => this.stepBoard(-1));
    this.makeButton('›', 699, 229, 42, 38, () => this.stepBoard(1));
  }

  private stepBoard(direction: number): void {
    if (this.state.boards.length <= 1) return;
    const current = this.state.boards.findIndex((board) => board.id === this.getDisplayedBoardId());
    const index = (current + direction + this.state.boards.length) % this.state.boards.length;
    this.selectBoard(this.state.boards[index].id);
  }

  private createPartWidgets(): void {
    PART_IDS.forEach((id, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 68 + column * (PART_WIDTH + PART_GAP);
      const y = 660 + row * (PART_HEIGHT + 8);
      const root = this.add.container(x, y).setDepth(3);
      const background = this.add.graphics();
      const flash = this.add.graphics().setAlpha(0);
      const icon = this.add.graphics();
      const name = this.add.text(48, 13, PART_LABELS[id], { fontFamily: FONT_DISPLAY, fontSize: '17px', color: '#c9fff4', fontStyle: 'bold', letterSpacing: 0.7 });
      const status = this.add.text(48, 35, 'OPERATIONAL', { fontFamily: FONT_DATA, fontSize: '10px', color: '#6ef0d6', letterSpacing: 0.25 });
      root.add([background, flash, icon, name, status]);
      const widget: PartWidget = { id, root, background, flash, icon, name, status, level: 0 };
      this.partWidgets.set(id, widget);
      this.drawPartWidget(widget, 0);
    });
    this.add.text(68, 640, 'AIRFRAME SYSTEMS', { fontFamily: FONT_DISPLAY, fontSize: '18px', color: '#dbe9ee', fontStyle: 'bold', letterSpacing: 1.8 }).setOrigin(0, 0.5).setDepth(3);
  }

  private drawPartWidget(widget: PartWidget, level: PartLevel): void {
    const colors = PART_COLORS[level];
    widget.level = level;
    widget.background.clear();
    widget.background.fillStyle(colors.fill, 1);
    widget.background.fillRoundedRect(0, 0, PART_WIDTH, PART_HEIGHT, 5);
    widget.background.lineStyle(level === 3 ? 1 : 2, colors.ring, level === 3 ? 0.75 : 0.9);
    widget.background.strokeRoundedRect(1, 1, PART_WIDTH - 2, PART_HEIGHT - 2, 5);
    widget.name.setText(PART_LABELS[widget.id]).setColor(colors.text);
    widget.status.setText(PART_STATES[level]).setColor(colors.ring === 0x332222 ? '#806565' : colors.text);
    this.drawPartIcon(widget.icon, widget.id, colors.ring);
  }

  private drawPartIcon(g: Phaser.GameObjects.Graphics, id: PartId, color: number): void {
    g.clear();
    g.lineStyle(2, color, 1);
    g.fillStyle(color, 0.12);
    if (id === 'engine') {
      g.strokeCircle(25, 29, 11); g.lineBetween(25, 7, 25, 17); g.lineBetween(14, 35, 6, 42); g.lineBetween(36, 35, 44, 42);
      g.lineStyle(1, color, 0.7); g.lineBetween(20, 44, 30, 44); g.lineBetween(22, 48, 28, 48);
    } else if (id === 'hull') {
      g.beginPath(); g.moveTo(25, 9); g.lineTo(42, 16); g.lineTo(40, 34); g.lineTo(25, 47); g.lineTo(10, 34); g.lineTo(8, 16); g.closePath(); g.strokePath();
      g.lineBetween(15, 28, 22, 35); g.lineBetween(22, 35, 35, 21);
    } else if (id === 'avionics') {
      g.strokeCircle(25, 28, 16); g.strokeCircle(25, 28, 7); g.lineBetween(25, 5, 25, 19); g.lineBetween(25, 37, 25, 51); g.lineBetween(2, 28, 18, 28); g.lineBetween(32, 28, 48, 28);
    } else if (id === 'fuel') {
      g.beginPath(); g.moveTo(25, 7); g.lineTo(39, 27); g.lineTo(39, 34); g.lineTo(34, 43); g.lineTo(25, 48); g.lineTo(16, 43); g.lineTo(11, 34); g.lineTo(11, 27); g.closePath(); g.strokePath();
      g.lineBetween(18, 33, 32, 33);
    } else if (id === 'comms') {
      g.fillCircle(25, 42, 3); g.lineBetween(25, 39, 25, 31); g.beginPath(); g.arc(25, 29, 9, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false); g.strokePath();
      g.beginPath(); g.arc(25, 27, 16, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false); g.strokePath();
    } else {
      g.strokeCircle(25, 29, 16); g.strokeCircle(25, 29, 9); g.lineBetween(25, 10, 25, 19); g.lineBetween(25, 39, 25, 48); g.lineBetween(6, 29, 16, 29); g.lineBetween(34, 29, 44, 29);
      g.fillCircle(25, 29, 3);
    }
  }

  private updatePartWidgets(): void {
    for (const widget of this.partWidgets.values()) {
      const level = this.state.plane.parts.get(widget.id)?.level ?? 0;
      if (widget.level !== level) this.drawPartWidget(widget, level);
    }
    this.repairStatus.setText(`REPAIR RESERVE  ${this.state.plane.repairCredits}/${GAME_CONFIG.MAX_REPAIR_CREDITS}`);
  }

  private animatePartChange(partId: PartId, type: 'hit' | 'repaired'): void {
    const widget = this.partWidgets.get(partId);
    if (!widget) return;
    const level = this.state.plane.parts.get(partId)?.level ?? 0;
    this.drawPartWidget(widget, level);
    if (this.reducedMotion) return;
    this.tweens.killTweensOf(widget.root);
    this.tweens.killTweensOf(widget.flash);
    this.tweens.killTweensOf(widget.status);
    widget.root.setScale(1);
    widget.flash.clear();
    const isDestroyed = level === 3;
    const flashColor = type === 'repaired' ? 0x75f0cd : isDestroyed ? 0xff5f52 : 0x6ef0d6;
    widget.flash.lineStyle(3, flashColor, 1);
    widget.flash.strokeRoundedRect(1, 1, PART_WIDTH - 2, PART_HEIGHT - 2, 5);
    widget.flash.setAlpha(1);
    // Scale punch: spec says 1.15 for hit
    const scaleAmount = isDestroyed ? 1.15 : type === 'repaired' ? 1.1 : 1.15;
    this.tweens.add({ targets: widget.root, scaleX: scaleAmount, scaleY: scaleAmount, duration: 120, yoyo: true, ease: 'Cubic.Out' });
    // Flash fade duration per spec
    const flashDuration = isDestroyed ? 300 : type === 'repaired' ? 180 : 200;
    this.tweens.add({ targets: widget.flash, alpha: 0, duration: flashDuration, ease: 'Cubic.Out' });
    widget.status.setAlpha(0.3);
    this.tweens.add({ targets: widget.status, alpha: 1, duration: 200, ease: 'Cubic.Out' });
  }

  private makeButton(label: string, x: number, y: number, width: number, height: number, action: () => void, compact = false): Phaser.GameObjects.Container {
    const root = this.add.container(x, y).setDepth(4).setSize(width, height);
    const bg = this.add.graphics();
    const text = this.add.text(width / 2, height / 2, label, {
      fontFamily: compact ? FONT_DATA : FONT_DISPLAY,
      fontSize: compact ? '10px' : '17px',
      color: '#c9fff4', fontStyle: compact ? 'normal' : 'bold', letterSpacing: compact ? 0.5 : 1.1,
    }).setOrigin(0.5);
    const paint = (hover = false) => {
      bg.clear(); bg.fillStyle(hover ? 0x17342f : 0x101a24, 1); bg.lineStyle(1, hover ? 0x6ef0d6 : 0x263a48, 1);
      bg.fillRoundedRect(0, 0, width, height, 4); bg.strokeRoundedRect(0, 0, width, height, 4);
    };
    paint(); root.add([bg, text]);
    root.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    root.on('pointerover', () => paint(true));
    root.on('pointerout', () => { paint(); root.setScale(1); });
    root.on('pointerdown', () => root.setScale(0.98));
    root.on('pointerup', () => { root.setScale(1); action(); });
    return root;
  }

  private refreshBoardLabels(): void {
    this.boardLabels.forEach((label) => label.destroy());
    this.boardLabels = [];
    this.boardSignature = `${this.focusedBoardId ?? ''}|${this.state.boards.map((board) => `${board.id}:${board.levelId}:${board.seed}`).join('|')}`;
    const displayed = this.state.boards.find((board) => board.id === this.getDisplayedBoardId());
    this.heading.setText(`${LEVELS[this.state.levelId].title.toUpperCase()}  ·  ${displayed ? `B${displayed.id}` : 'NO BOARD'}`);
    this.subheading.setText(this.state.phase === 'playing'
      ? 'PILOT: WASD / ARROWS   ·   CHAT: !bN wire C3 UP RIGHT   ·   REPAIR: !repair hull'
      : 'PILOT THROUGH DANMAKU  ·  CHAT ROUTES POWER AND REPAIRS SYSTEMS');
    this.boardTitle.setText(displayed ? `B${displayed.id}  ·  ${LEVELS[displayed.levelId].title.toUpperCase()}` : 'BOARD PAGES');
    this.boardPage.setText(displayed ? `${this.state.boards.findIndex((board) => board.id === displayed.id) + 1} / ${this.state.boards.length}` : '0 / 0');
    for (let column = 0; column < BOARD_SIZE.columns; column++) {
      this.boardLabels.push(this.add.text(BOARD_ORIGIN_X + column * CELL + CELL / 2, BOARD_Y - 32, String.fromCharCode(65 + column), { fontFamily: FONT_DATA, fontSize: '10px', color: '#5f7684' }).setOrigin(0.5).setDepth(3));
    }
    for (let row = 0; row < BOARD_SIZE.rows; row++) {
      this.boardLabels.push(this.add.text(BOARD_ORIGIN_X - 20, BOARD_Y + row * CELL + CELL / 2, String(row + 1), { fontFamily: FONT_DATA, fontSize: '10px', color: '#5f7684' }).setOrigin(0.5).setDepth(3));
    }
    if (!displayed) return;
    const board = displayed;
    const level = board.level;
    const addLabel = (cell: Cell, text: string, color = '#d8e4e8') => {
      this.boardLabels.push(this.add.text(BOARD_ORIGIN_X + cell.column * CELL + CELL / 2, BOARD_Y + cell.row * CELL + CELL / 2 + 24, text, { fontFamily: FONT_DATA, fontSize: '9px', color, fontStyle: 'bold', letterSpacing: 0.3 }).setOrigin(0.5).setDepth(3));
    };
    for (const source of level.sources) addLabel(source, source.label);
    addLabel(level.target, 'DRIVE');
    for (const cell of level.blocked) addLabel(cell, 'HULL');
    if (level.gate) addLabel(level.gate, 'AND', '#18232c');
  }

  private drawBoard(): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x080d14, 1); g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x101b27, 1); g.fillRoundedRect(52, 252, 688, 414, 10);
    g.fillStyle(0x0b151f, 1); g.fillRoundedRect(FLIGHT_ARENA.x, FLIGHT_ARENA.y, FLIGHT_ARENA.width, FLIGHT_ARENA.height, 12);
    g.lineStyle(1, 0x293d4f, 0.9); g.strokeRoundedRect(FLIGHT_ARENA.x, FLIGHT_ARENA.y, FLIGHT_ARENA.width, FLIGHT_ARENA.height, 12);
    for (let x = FLIGHT_ARENA.x + 38; x < FLIGHT_ARENA.x + FLIGHT_ARENA.width; x += 38) { g.lineStyle(1, 0x243746, 0.16); g.lineBetween(x, FLIGHT_ARENA.y + 2, x, FLIGHT_ARENA.y + FLIGHT_ARENA.height - 2); }
    for (let y = FLIGHT_ARENA.y + 38; y < FLIGHT_ARENA.y + FLIGHT_ARENA.height; y += 38) { g.lineStyle(1, 0x243746, 0.16); g.lineBetween(FLIGHT_ARENA.x + 2, y, FLIGHT_ARENA.x + FLIGHT_ARENA.width - 2, y); }

    const board = this.state.boards.find((candidate) => candidate.id === this.getDisplayedBoardId());
    if (board) this.drawCircuitBoard(board);
    const allBoardsOnline = this.state.boards.length > 0 && this.state.boards.every((candidate) => candidate.solved);
    const exitX = FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2;
    g.fillStyle(allBoardsOnline ? 0x72e8bf : 0x8e7853, allBoardsOnline ? 0.9 : 0.55); g.fillRoundedRect(exitX - 56, FLIGHT_ARENA.y + 3, 112, 8, 3);
    g.lineStyle(1, allBoardsOnline ? 0xa2ffdc : 0xc8a96c, 0.75);
    g.lineBetween(exitX - 56, FLIGHT_ARENA.y + 3, exitX - 56, FLIGHT_ARENA.y + 18); g.lineBetween(exitX + 56, FLIGHT_ARENA.y + 3, exitX + 56, FLIGHT_ARENA.y + 18);
    for (const bullet of this.state.bullets) {
      const tailX = bullet.x - bullet.velocityX * 0.055; const tailY = bullet.y - bullet.velocityY * 0.055;
      g.lineStyle(3, bullet.color, 0.38); g.lineBetween(tailX, tailY, bullet.x, bullet.y);
      g.fillStyle(bullet.color, 1);
      if (bullet.diamond) g.fillRect(bullet.x - bullet.radius * 0.72, bullet.y - bullet.radius * 0.72, bullet.radius * 1.44, bullet.radius * 1.44);
      else g.fillCircle(bullet.x, bullet.y, bullet.radius);
      g.fillStyle(0xffffff, 0.75); g.fillCircle(bullet.x, bullet.y, 1.7);
    }
    const shipColor = !this.reducedMotion && this.state.hitCooldown > 0 && Math.floor(this.state.elapsed * 18) % 2 === 0 ? 0xffffff : allBoardsOnline ? 0x84f1d3 : 0xf6bd67;
    const directionX = Math.cos(this.state.shipAngle); const directionY = Math.sin(this.state.shipAngle);
    const sideX = -directionY; const sideY = directionX;
    g.fillStyle(shipColor, 1);
    g.fillTriangle(this.state.shipX + directionX * 17, this.state.shipY + directionY * 17, this.state.shipX - directionX * 10 + sideX * 10, this.state.shipY - directionY * 10 + sideY * 10, this.state.shipX - directionX * 10 - sideX * 10, this.state.shipY - directionY * 10 - sideY * 10);
    g.lineStyle(1, 0xffffff, 0.8); g.strokeCircle(this.state.shipX, this.state.shipY, 7);
    g.fillStyle(0xffffff, 1); g.fillCircle(this.state.shipX, this.state.shipY, 3.3);
    if (this.state.hitCooldown > 0) { g.lineStyle(2, 0x9cf4ff, 0.72); g.strokeCircle(this.state.shipX, this.state.shipY, 16); }
    if (this.state.plane.parts.get('life_support')?.level === 3) this.drawLifeSupportVignette(g);
    this.drawCornerDetails(g);
  }

  private drawCircuitBoard(board: CircuitBoard): void {
    const g = this.graphics; const level = board.level;
    for (let row = 0; row < BOARD_SIZE.rows; row++) {
      for (let column = 0; column < BOARD_SIZE.columns; column++) {
        const x = BOARD_ORIGIN_X + column * CELL; const y = BOARD_Y + row * CELL; const key = cellKey(column, row);
        const source = level.sources.find((cell) => cell.column === column && cell.row === row);
        const isSource = Boolean(source); const isTarget = column === level.target.column && row === level.target.row;
        const isBlocked = level.blocked.some((cell) => cell.column === column && cell.row === row);
        const isGate = Boolean(level.gate && level.gate.column === column && level.gate.row === row);
        const powered = board.powered.has(key); const gateOn = level.gate ? board.gateInputs.size === level.gate.inputs.length : false;
        g.fillStyle(isSource ? 0x143e42 : isTarget ? (board.solved ? 0x165344 : 0x263748) : isBlocked ? 0x332c2a : isGate ? (gateOn ? 0x165344 : 0x49402b) : 0x121e2a, 1);
        g.fillRoundedRect(x + 3, y + 3, CELL - 6, CELL - 6, 6);
        g.lineStyle(1, isSource ? 0x56d3bd : (isTarget || isGate) && (isGate ? gateOn : board.solved) ? 0x8af5b6 : 0x293a4a, 1);
        g.strokeRoundedRect(x + 3, y + 3, CELL - 6, CELL - 6, 6);
        if (isBlocked) { g.lineStyle(4, 0x99715b, 0.85); g.beginPath(); g.moveTo(x + 20, y + 20); g.lineTo(x + CELL - 20, y + CELL - 20); g.moveTo(x + CELL - 20, y + 20); g.lineTo(x + 20, y + CELL - 20); g.strokePath(); }
        else if (isGate) { g.fillStyle(gateOn ? 0x9fffc3 : 0xffd17d, 1); g.fillRoundedRect(x + 16, y + 23, CELL - 32, CELL - 46, 5); this.drawGateIndicators(x, y, board, gateOn); }
        else if (isSource || isTarget) { g.fillStyle(isSource ? 0x80f4e0 : board.solved ? 0x9fffc3 : 0x8ca4b9, 1); g.fillCircle(x + CELL / 2, y + CELL / 2, 13); }
        else {
          const tile = board.tiles.get(key);
          if (tile) { const shorted = board.shortCell === key && board.shortFlashTimer > 0; if (shorted) { g.fillStyle(0x632e32, 0.85); g.fillRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 6); } this.drawTile(x, y, tile.kind, powered, shorted); }
        }
      }
    }
  }

  private drawGateIndicators(x: number, y: number, board: CircuitBoard, gateOn: boolean): void {
    const gate = board.level.gate; if (!gate) return;
    const points: Record<Direction, [number, number]> = {
      N: [x + CELL / 2, y + 10], E: [x + CELL - 10, y + CELL / 2],
      S: [x + CELL / 2, y + CELL - 10], W: [x + 10, y + CELL / 2],
    };
    gate.inputs.forEach((input) => {
      const point = points[input.side];
      this.graphics.fillStyle(board.gateInputs.has(input.id) ? 0x75f0cd : 0x536171, 1); this.graphics.fillCircle(point[0], point[1], 5);
    });
    const [outX, outY] = points[gate.output];
    this.graphics.lineStyle(2, gateOn ? 0x75f0cd : 0x777064, 1);
    this.graphics.lineBetween(x + CELL / 2, y + CELL / 2, outX, outY);
  }

  private drawTile(x: number, y: number, kind: TileKind, powered: boolean, shorted: boolean): void {
    const g = this.graphics; const centerX = x + CELL / 2; const centerY = y + CELL / 2; const inset = 18;
    const endpoints: Record<string, [number, number]> = { N: [centerX, y + inset], E: [x + CELL - inset, centerY], S: [centerX, y + CELL - inset], W: [x + inset, centerY] };
    const ports = PORTS[kind]; const color = shorted ? 0xff776c : powered ? 0x69eed5 : 0x778da1;
    g.lineStyle(powered || shorted ? 10 : 8, shorted ? 0x8d333d : powered ? 0x21645f : 0x293d4f, 1);
    g.lineBetween(endpoints[ports[0]][0], endpoints[ports[0]][1], centerX, centerY); g.lineBetween(centerX, centerY, endpoints[ports[1]][0], endpoints[ports[1]][1]);
    g.lineStyle(powered ? 4 : 3, color, 1); g.lineBetween(endpoints[ports[0]][0], endpoints[ports[0]][1], centerX, centerY); g.lineBetween(centerX, centerY, endpoints[ports[1]][0], endpoints[ports[1]][1]);
    g.fillStyle(powered ? 0x9bf8e8 : 0xb1c1cf, 1); g.fillCircle(centerX, centerY, 3);
  }

  private drawLifeSupportVignette(g: Phaser.GameObjects.Graphics): void {
    const rings = 8;
    for (let i = 0; i < rings; i++) {
      const inset = i * 7; const alpha = 0.022 * (1 - i / rings);
      g.fillStyle(0x420b13, alpha);
      g.fillRect(inset, inset, WIDTH - inset * 2, 8);
      g.fillRect(inset, HEIGHT - inset - 8, WIDTH - inset * 2, 8);
      g.fillRect(inset, inset + 8, 8, HEIGHT - inset * 2 - 16);
      g.fillRect(WIDTH - inset - 8, inset + 8, 8, HEIGHT - inset * 2 - 16);
    }
  }

  private drawCornerDetails(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1, 0x2f8a7d, 0.42);
    for (const [x, y, dx, dy] of [[40, 40, 1, 1], [1560, 40, -1, 1], [40, 860, 1, -1], [1560, 860, -1, -1]]) {
      g.lineBetween(x, y, x + dx * 22, y); g.lineBetween(x, y, x, y + dy * 22);
    }
  }
}
