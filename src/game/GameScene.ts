import Phaser from 'phaser';
import { beginRound, createInitialState, FLIGHT_ARENA, noteActiveChatter, parseWireCommand, placeWire, simulatePilotHit, updateRound, type CircuitBoard, type GameState } from '../core/multiGame';
import { BOARD_SIZE, LEVELS, cellKey, type Cell, type LevelId, type TileKind } from '../core/game';

const WIDTH = 1240;
const HEIGHT = 760;
const CELL = 66;
const BOARD_Y = 250;
const BOARD_ORIGIN_X = 78;
const PORTS: Record<TileKind, string[]> = { H: ['E', 'W'], V: ['N', 'S'], NE: ['N', 'E'], ES: ['E', 'S'], SW: ['S', 'W'], WN: ['W', 'N'] };

export class GameScene extends Phaser.Scene {
  private state: GameState = createInitialState();
  private graphics!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private heading!: Phaser.GameObjects.Text;
  private subheading!: Phaser.GameObjects.Text;
  private boardLabels: Phaser.GameObjects.Text[] = [];
  private boardSignature = '';
  private focusedBoardId: number | null = null;
  private simulatedChatter = 0;
  private pendingChatters = new Set<string>();
  private pendingCommands: Array<{ raw: string; owner: string }> = [];
  private pendingPilotHits = 0;
  private lastDraw = 0;
  private lastReportedEvent = 'Pilot ready. Chat can route the drive.';
  public onEvent: (message: string, good: boolean) => void = () => undefined;
  public onState: (state: GameState) => void = () => undefined;

  constructor() { super('Game'); }

  create(): void {
    this.graphics = this.add.graphics();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.add.text(54, 48, 'DEAD CIRCUIT · SHARED POWER ROUTING', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#68e4d5', letterSpacing: 3 }).setOrigin(0, 0.5);
    this.heading = this.add.text(54, 78, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', color: '#eaf5f5', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.subheading = this.add.text(54, 106, '', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#8195a8', letterSpacing: 1 }).setOrigin(0, 0.5);
    this.add.text(BOARD_ORIGIN_X + 8, 158, 'ROUTING BOARD', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#68e4d5', letterSpacing: 2 }).setOrigin(0, 0.5);
    this.add.text(FLIGHT_ARENA.x + 12, FLIGHT_ARENA.y - 13, 'DANMAKU FLIGHT DECK', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#68e4d5', letterSpacing: 2 }).setOrigin(0, 0.5);
    this.add.text(FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2, FLIGHT_ARENA.y + 23, 'EXIT', { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#ffd17d', fontStyle: 'bold', letterSpacing: 2 }).setOrigin(0.5, 0.5);
    for (let column = 0; column < BOARD_SIZE.columns; column++) {
      this.add.text(BOARD_ORIGIN_X + column * CELL + CELL / 2, BOARD_Y - 14, String.fromCharCode(65 + column), { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#6d8296' }).setOrigin(0.5);
    }
    for (let row = 0; row < BOARD_SIZE.rows; row++) {
      this.add.text(BOARD_ORIGIN_X - 20, BOARD_Y + row * CELL + CELL / 2, String(row + 1), { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#6d8296' }).setOrigin(0.5);
    }
    this.refreshBoardLabels();
    this.drawBoard();
  }

  update(_time: number, deltaMs: number): void {
    this.processPendingInputs();
    const x = (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
    const y = (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
    const length = Math.hypot(x, y) || 1;
    updateRound(this.state, deltaMs / 1000, { x: x / length, y: y / length });
    const signature = `${this.focusedBoardId ?? ''}|${this.state.boards.map((board) => `${board.id}:${board.levelId}:${board.seed}`).join('|')}`;
    if (signature !== this.boardSignature) this.refreshBoardLabels();
    if (this.state.lastEvent !== this.lastReportedEvent) {
      this.lastReportedEvent = this.state.lastEvent;
      if (this.state.lastEvent.startsWith('IMPACT') || this.state.lastEvent.startsWith('BOARD ') || this.state.phase === 'won' || this.state.phase === 'lost') {
        this.onEvent(this.state.lastEvent, false);
      }
    }
    if (_time - this.lastDraw > 33) {
      this.drawBoard();
      this.lastDraw = _time;
      this.onState(this.state);
    }
  }

  startRun(levelId: LevelId): void {
    this.state = createInitialState(levelId);
    this.focusedBoardId = null;
    this.pendingChatters.clear();
    this.pendingCommands = [];
    this.pendingPilotHits = 0;
    this.refreshBoardLabels();
    beginRound(this.state);
    this.lastReportedEvent = this.state.lastEvent;
    this.onEvent(this.state.lastEvent, true);
    this.onState(this.state);
    this.drawBoard();
  }

  submitWire(raw: string, owner: string): void {
    if (this.pendingCommands.length >= 128) {
      this.onEvent('Command queue is full; wait a moment and try again.', false);
      return;
    }
    this.pendingCommands.push({ raw, owner });
  }

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
      const parsed = parseWireCommand(command.raw, command.owner);
      if (typeof parsed === 'string') {
        this.state.lastEvent = parsed;
        this.lastReportedEvent = parsed;
        this.onEvent(parsed, false);
        continue;
      }
      const result = placeWire(this.state, parsed);
      this.lastReportedEvent = this.state.lastEvent;
      this.onEvent(result.message, result.accepted && !result.short);
    }

    const hitCount = this.pendingPilotHits;
    this.pendingPilotHits = 0;
    for (let i = 0; i < hitCount; i++) {
      simulatePilotHit(this.state);
      this.lastReportedEvent = this.state.lastEvent;
      this.onEvent(this.state.lastEvent, false);
    }
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
    this.onState(this.state);
  }

  private drawBoard(): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x0a111b, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x101b27, 1);
    g.fillRoundedRect(42, 140, 548, 484, 12);
    g.fillRoundedRect(FLIGHT_ARENA.x, FLIGHT_ARENA.y, FLIGHT_ARENA.width, FLIGHT_ARENA.height, 14);
    const displayedBoard = this.state.boards.find((board) => board.id === this.getDisplayedBoardId());
    if (displayedBoard) this.drawCircuitBoard(displayedBoard, BOARD_ORIGIN_X);

    const allBoardsOnline = this.state.boards.length > 0 && this.state.boards.every((board) => board.solved);
    g.lineStyle(1, 0x293d4f, 0.8);
    g.strokeRoundedRect(FLIGHT_ARENA.x, FLIGHT_ARENA.y, FLIGHT_ARENA.width, FLIGHT_ARENA.height, 14);
    for (let x = FLIGHT_ARENA.x + 38; x < FLIGHT_ARENA.x + FLIGHT_ARENA.width; x += 38) {
      g.lineStyle(1, 0x243746, 0.16);
      g.lineBetween(x, FLIGHT_ARENA.y + 2, x, FLIGHT_ARENA.y + FLIGHT_ARENA.height - 2);
    }
    for (let y = FLIGHT_ARENA.y + 38; y < FLIGHT_ARENA.y + FLIGHT_ARENA.height; y += 38) {
      g.lineStyle(1, 0x243746, 0.16);
      g.lineBetween(FLIGHT_ARENA.x + 2, y, FLIGHT_ARENA.x + FLIGHT_ARENA.width - 2, y);
    }
    const exitX = FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2;
    g.fillStyle(allBoardsOnline ? 0x72e8bf : 0x8e7853, allBoardsOnline ? 0.9 : 0.55);
    g.fillRoundedRect(exitX - 44, FLIGHT_ARENA.y + 4, 88, 7, 3);
    g.lineStyle(1, allBoardsOnline ? 0xa2ffdc : 0xc8a96c, 0.75);
    g.lineBetween(exitX - 44, FLIGHT_ARENA.y + 4, exitX - 44, FLIGHT_ARENA.y + 20);
    g.lineBetween(exitX + 44, FLIGHT_ARENA.y + 4, exitX + 44, FLIGHT_ARENA.y + 20);
    for (const bullet of this.state.bullets) {
      const tailX = bullet.x - bullet.velocityX * 0.055;
      const tailY = bullet.y - bullet.velocityY * 0.055;
      g.lineStyle(3, bullet.color, 0.38);
      g.lineBetween(tailX, tailY, bullet.x, bullet.y);
      g.fillStyle(bullet.color, 1);
      if (bullet.diamond) g.fillRect(bullet.x - bullet.radius * 0.72, bullet.y - bullet.radius * 0.72, bullet.radius * 1.44, bullet.radius * 1.44);
      else g.fillCircle(bullet.x, bullet.y, bullet.radius);
      g.fillStyle(0xffffff, 0.75);
      g.fillCircle(bullet.x, bullet.y, 1.7);
    }
    const shipColor = this.state.hitCooldown > 0 && Math.floor(this.state.elapsed * 18) % 2 === 0 ? 0xffffff : allBoardsOnline ? 0x84f1d3 : 0xf6bd67;
    const directionX = Math.cos(this.state.shipAngle);
    const directionY = Math.sin(this.state.shipAngle);
    const sideX = -directionY;
    const sideY = directionX;
    const noseX = this.state.shipX + directionX * 14;
    const noseY = this.state.shipY + directionY * 14;
    const rearX = this.state.shipX - directionX * 9;
    const rearY = this.state.shipY - directionY * 9;
    g.fillStyle(shipColor, 1);
    g.fillTriangle(noseX, noseY, rearX + sideX * 9, rearY + sideY * 9, rearX - sideX * 9, rearY - sideY * 9);
    g.lineStyle(1, 0xffffff, 0.8);
    g.strokeCircle(this.state.shipX, this.state.shipY, 7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(this.state.shipX, this.state.shipY, 3.3);
    if (this.state.hitCooldown > 0) {
      g.lineStyle(2, 0x9cf4ff, 0.72);
      g.strokeCircle(this.state.shipX, this.state.shipY, 16 + Math.sin(this.state.elapsed * 20) * 2);
    }
  }

  private drawCircuitBoard(board: CircuitBoard, originX: number): void {
    const g = this.graphics;
    const level = board.level;
    for (let row = 0; row < BOARD_SIZE.rows; row++) {
      for (let column = 0; column < BOARD_SIZE.columns; column++) {
        const x = originX + column * CELL;
        const y = BOARD_Y + row * CELL;
        const key = cellKey(column, row);
        const source = level.sources.find((cell) => cell.column === column && cell.row === row);
        const isSource = Boolean(source);
        const isTarget = column === level.target.column && row === level.target.row;
        const isBlocked = level.blocked.some((cell) => cell.column === column && cell.row === row);
        const isGate = Boolean(level.gate && level.gate.column === column && level.gate.row === row);
        const isPowered = board.powered.has(key);
        const gateOn = level.gate ? board.gateInputs.size === level.gate.inputs.length : false;
        g.fillStyle(isSource ? 0x143e42 : isTarget ? (board.solved ? 0x165344 : 0x263748) : isBlocked ? 0x332c2a : isGate ? (gateOn ? 0x165344 : 0x49402b) : 0x121e2a, 1);
        g.fillRoundedRect(x + 3, y + 3, CELL - 6, CELL - 6, 7);
        g.lineStyle(1, isSource ? 0x56d3bd : (isTarget || isGate) && (isGate ? gateOn : board.solved) ? 0x8af5b6 : 0x293a4a, 1);
        g.strokeRoundedRect(x + 3, y + 3, CELL - 6, CELL - 6, 7);
        if (isBlocked) {
          g.lineStyle(4, 0x99715b, 0.85);
          g.beginPath(); g.moveTo(x + 19, y + 20); g.lineTo(x + CELL - 19, y + CELL - 20); g.moveTo(x + CELL - 19, y + 20); g.lineTo(x + 19, y + CELL - 20); g.strokePath();
        } else if (isGate) {
          g.fillStyle(gateOn ? 0x9fffc3 : 0xffd17d, 1);
          g.fillRoundedRect(x + 15, y + 20, CELL - 30, CELL - 40, 6);
          this.drawGateIndicators(x, y, board, gateOn);
        } else if (isSource || isTarget) {
          g.fillStyle(isSource ? 0x80f4e0 : board.solved ? 0x9fffc3 : 0x8ca4b9, 1);
          g.fillCircle(x + CELL / 2, y + CELL / 2, 12);
        } else {
          const tile = board.tiles.get(key);
          if (tile) {
            const shorted = board.shortCell === key && board.shortFlashTimer > 0;
            if (shorted) {
              g.fillStyle(0x632e32, 0.85);
              g.fillRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 7);
            }
            this.drawTile(x, y, tile.kind, isPowered, shorted);
          }
        }
      }
    }
  }

  private refreshBoardLabels(): void {
    this.boardLabels.forEach((label) => label.destroy());
    this.boardLabels = [];
    this.boardSignature = `${this.focusedBoardId ?? ''}|${this.state.boards.map((board) => `${board.id}:${board.levelId}:${board.seed}`).join('|')}`;
    const displayed = this.state.boards.find((board) => board.id === this.getDisplayedBoardId());
    this.heading.setText(`${LEVELS[this.state.levelId].title.toUpperCase()} · ${displayed ? `B${displayed.id}` : 'NO BOARD'}`);
    this.subheading.setText('WASD / ARROWS TO DODGE · CHAT ROUTES POWER · EXIT OPENS WHEN ALL BOARDS ARE ONLINE');
    if (displayed) {
      const board = displayed;
      const originX = BOARD_ORIGIN_X;
      const level = board.level;
      this.boardLabels.push(this.add.text(originX + 8, 180, `B${board.id} · ${LEVELS[board.levelId].title.toUpperCase()}`, { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#68e4d5', fontStyle: 'bold', letterSpacing: 1 }).setOrigin(0, 0.5));
      const addLabel = (cell: Cell, text: string, color = '#d8e4e8') => {
        this.boardLabels.push(this.add.text(originX + cell.column * CELL + CELL / 2, BOARD_Y + cell.row * CELL + CELL / 2 + 23, text, { fontFamily: 'Arial, sans-serif', fontSize: '8px', color, fontStyle: 'bold', letterSpacing: 0.5 }).setOrigin(0.5));
      };
      for (const source of level.sources) addLabel(source, source.label);
      addLabel(level.target, 'DRIVE');
      for (const cell of level.blocked) addLabel(cell, 'HULL');
      if (level.gate) addLabel(level.gate, 'AND', '#18232c');
    }
  }

  private drawGateIndicators(x: number, y: number, board: CircuitBoard, gateOn: boolean): void {
    const g = this.graphics;
    const gate = board.level.gate;
    if (!gate) return;
    gate.inputs.forEach((input) => {
      const active = board.gateInputs.has(input.id);
      const point = input.id === 'A' ? [x + 10, y + CELL / 2] : [x + CELL / 2, y + CELL - 10];
      g.fillStyle(active ? 0x75f0cd : 0x536171, 1);
      g.fillCircle(point[0], point[1], 5);
    });
    g.lineStyle(2, gateOn ? 0x75f0cd : 0x777064, 1);
    g.lineBetween(x + CELL - 10, y + CELL / 2, x + CELL - 3, y + CELL / 2);
  }

  private drawTile(x: number, y: number, kind: TileKind, powered: boolean, shorted: boolean): void {
    const g = this.graphics;
    const centerX = x + CELL / 2;
    const centerY = y + CELL / 2;
    const inset = 17;
    const endpoints: Record<string, [number, number]> = { N: [centerX, y + inset], E: [x + CELL - inset, centerY], S: [centerX, y + CELL - inset], W: [x + inset, centerY] };
    const color = shorted ? 0xff776c : powered ? 0x69eed5 : 0x778da1;
    const ports = PORTS[kind];
    g.lineStyle(powered || shorted ? 10 : 8, shorted ? 0x8d333d : powered ? 0x21645f : 0x293d4f, 1);
    g.lineBetween(endpoints[ports[0]][0], endpoints[ports[0]][1], centerX, centerY);
    g.lineBetween(centerX, centerY, endpoints[ports[1]][0], endpoints[ports[1]][1]);
    g.lineStyle(powered ? 4 : 3, color, 1);
    g.lineBetween(endpoints[ports[0]][0], endpoints[ports[0]][1], centerX, centerY);
    g.lineBetween(centerX, centerY, endpoints[ports[1]][0], endpoints[ports[1]][1]);
    g.fillStyle(powered ? 0x9bf8e8 : 0xb1c1cf, 1);
    g.fillCircle(centerX, centerY, 3);
  }
}
