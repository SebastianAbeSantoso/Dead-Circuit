import { GAME_CONFIG as config } from './config';
import {
  BOARD_SIZE, LEVELS, cellKey,
  type Cell, type Direction, type LevelDefinition, type LevelId, type TileKind, type WireTile,
} from './game';

export type RoundPhase = 'ready' | 'playing' | 'won' | 'lost';
export interface Projectile {
  x: number; y: number; previousX: number; previousY: number;
  velocityX: number; velocityY: number; radius: number; color: number; diamond: boolean;
}
export const FLIGHT_ARENA = { x: 630, y: 140, width: 570, height: 570 } as const;
export interface CircuitBoard {
  id: number;
  levelId: LevelId;
  seed: number;
  level: LevelDefinition;
  tiles: Map<string, WireTile>;
  powered: Set<string>;
  gateInputs: Set<string>;
  shorts: number;
  shortCell: string | null;
  shortFlashTimer: number;
  solved: boolean;
  placementCount: number;
  lastActivityAt: number | null;
  createdBy: 'start' | 'chat growth' | 'pilot hit';
}
export interface GameState {
  levelId: LevelId;
  phase: RoundPhase;
  boards: CircuitBoard[];
  activeChatters: Map<string, number>;
  activeChatterCount: number;
  boardCapacity: number;
  desiredBoardCount: number;
  nextBoardId: number;
  runSeed: number;
  boardSpawnTimer: number;
  chatterPruneTimer: number;
  hitBoardCooldown: number;
  danger: number;
  shipX: number;
  shipY: number;
  shipAngle: number;
  bullets: Projectile[];
  nextPatternIn: number;
  patternIndex: number;
  hitCooldown: number;
  elapsed: number;
  lastEvent: string;
}
export interface ParsedWireCommand extends Cell { boardId: number; kind: TileKind; label: string }

export const CHATTER_WINDOW_MS = config.CHATTER_WINDOW_MS;
export const CHATTERS_PER_BOARD = config.CHATTERS_PER_BOARD;
export const MAX_BOARDS_PER_RUN = config.MAX_BOARDS_PER_RUN;
export const BOARD_SPAWN_INTERVAL = config.BOARD_SPAWN_INTERVAL_SECONDS;
export const HIT_BOARD_COOLDOWN = config.HIT_BOARD_COOLDOWN_SECONDS;

const PORTS: Record<TileKind, Direction[]> = {
  H: ['E', 'W'], V: ['N', 'S'], NE: ['N', 'E'], ES: ['E', 'S'], SW: ['S', 'W'], WN: ['W', 'N'],
};
const PORT_TILE: Record<string, TileKind> = { EN: 'NE', ES: 'ES', NS: 'V', EW: 'H', SW: 'SW', NW: 'WN' };
const OPPOSITE: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const STEP: Record<Direction, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];

export const labelCell = (column: number, row: number) => `${String.fromCharCode(65 + column)}${row + 1}`;

export function createInitialState(levelId: LevelId = 'standard', seed = randomSeed()): GameState {
  const state: GameState = {
    levelId, phase: 'ready', boards: [], activeChatters: new Map(), activeChatterCount: 0,
    boardCapacity: 2, desiredBoardCount: 1, nextBoardId: 1, runSeed: seed >>> 0,
    boardSpawnTimer: 0, chatterPruneTimer: 1, hitBoardCooldown: 0, danger: 0,
    shipX: FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2, shipY: FLIGHT_ARENA.y + FLIGHT_ARENA.height - 42, shipAngle: -Math.PI / 2,
    bullets: [],    nextPatternIn: config.PATTERN_INITIAL_DELAY_SECONDS, patternIndex: 0, hitCooldown: 0, elapsed: 0,
    lastEvent: 'Pilot ready. Chat can route the drive.',
  };
  addBoard(state, 'start');
  return state;
}

function randomSeed(): number { return Math.floor(Math.random() * 0x7fffffff) >>> 0; }
function mixSeed(seed: number, id: number): number { return (seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0; }

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function copyLevel(levelId: LevelId): LevelDefinition {
  const source = LEVELS[levelId];
  return {
    ...source,
    sources: source.sources.map((cell) => ({ ...cell })),
    target: { ...source.target },
    blocked: source.blocked.map((cell) => ({ ...cell })),
    gate: source.gate ? { ...source.gate, inputs: source.gate.inputs.map((input) => ({ ...input, neighbor: { ...input.neighbor } })) } : undefined,
  };
}

function isSame(a: Cell, b: Cell): boolean { return a.column === b.column && a.row === b.row; }
function keyFor(cell: Cell): string { return cellKey(cell.column, cell.row); }

interface SearchNode extends Cell { incoming: Direction | null; cost: number; estimate: number; path: Cell[] }

/** Seeded A*: tie-cost variation makes obstacle layouts produce repeatable route variety. */
function findPath(start: Cell, goal: Cell, blocked: Cell[], forbidden: Cell[], seed: number): Cell[] | null {
  const random = seededRandom(seed);
  const open: SearchNode[] = [{ ...start, incoming: null, cost: 0, estimate: manhattan(start, goal), path: [{ ...start }] }];
  const best = new Map<string, number>();
  let steps = 0;
  while (open.length && steps++ < BOARD_SIZE.columns * BOARD_SIZE.rows * 16) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) if (open[i].estimate < open[bestIndex].estimate) bestIndex = i;
    const [current] = open.splice(bestIndex, 1);
    if (isSame(current, goal)) return current.path;
    for (const direction of DIRECTIONS) {
      const [dx, dy] = STEP[direction];
      const next = { column: current.column + dx, row: current.row + dy };
      if (next.column < 0 || next.row < 0 || next.column >= BOARD_SIZE.columns || next.row >= BOARD_SIZE.rows) continue;
      if (blocked.some((cell) => isSame(cell, next)) || (forbidden.some((cell) => isSame(cell, next)) && !isSame(next, goal))) continue;
      if (current.path.some((cell) => isSame(cell, next))) continue;
      const turnCost = current.incoming && current.incoming !== direction ? 0.55 : 0;
      const nextCost = current.cost + 1 + turnCost + random() * 0.12;
      const stateKey = `${next.column},${next.row},${direction}`;
      if (nextCost >= (best.get(stateKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(stateKey, nextCost);
      open.push({ ...next, incoming: direction, cost: nextCost, estimate: nextCost + manhattan(next, goal), path: [...current.path, next] });
    }
  }
  return null;
}

function manhattan(a: Cell, b: Cell): number { return Math.abs(a.column - b.column) + Math.abs(a.row - b.row); }

function tilesForPath(path: Cell[], owner = 'ROUTE CHECK'): Map<string, WireTile> {
  const tiles = new Map<string, WireTile>();
  for (let i = 1; i < path.length - 1; i++) {
    const previous = path[i - 1];
    const current = path[i];
    const next = path[i + 1];
    const incoming = directionBetween(current, previous);
    const outgoing = directionBetween(current, next);
    const kind = PORT_TILE[[incoming, outgoing].sort().join('')];
    if (kind) tiles.set(keyFor(current), { kind, owner });
  }
  return tiles;
}

function directionBetween(from: Cell, to: Cell): Direction {
  if (to.column > from.column) return 'E';
  if (to.column < from.column) return 'W';
  return to.row > from.row ? 'S' : 'N';
}

function generateLevel(levelId: LevelId, seed: number): LevelDefinition {
  const level = copyLevel(levelId);
  const random = seededRandom(seed);
  if (levelId === 'standard') {
    const obstacle = { column: 2 + Math.floor(random() * 3), row: 2 };
    let route = findPath(level.sources[0], level.target, [obstacle], [], seed);
    if (!route) route = findPath(level.sources[0], level.target, [], [], seed);
    if (!route) return level;
    level.blocked = [obstacle];
    const onRoute = new Set(route.map(keyFor));
    const candidates: Cell[] = [];
    for (let row = 0; row < level.rows; row++) for (let column = 1; column < level.columns - 1; column++) {
      const cell = { column, row };
      if (!onRoute.has(keyFor(cell)) && !isSame(cell, obstacle)) candidates.push(cell);
    }
    shuffle(candidates, random);
    for (const cell of candidates.slice(0, Math.floor(random() * 3))) level.blocked.push(cell);
    const verifiedPath = findPath(level.sources[0], level.target, level.blocked, [], seed ^ 0xa511e9b3);
    if (!verifiedPath || !calculatePower(tilesForPath(verifiedPath), level).powered.has('TARGET')) level.blocked = [obstacle];
    level.description = `Route CORE to DRIVE around randomized hull damage (${labelCell(obstacle.column, obstacle.row)}).`;
    return level;
  }

  const fixedRoute = ['1,1', '2,1', '2,2', '1,3', '2,3', '3,3', '4,2', '5,2'];
  const fixedCells = new Set(fixedRoute);
  const special = [...level.sources, level.target, ...(level.gate ? [level.gate] : [])];
  const candidates: Cell[] = [];
  for (let row = 0; row < level.rows; row++) for (let column = 0; column < level.columns; column++) {
    const cell = { column, row };
    if (!fixedCells.has(keyFor(cell)) && !special.some((fixed) => isSame(fixed, cell))) candidates.push(cell);
  }
  shuffle(candidates, random);
  level.blocked = candidates.slice(0, 1 + Math.floor(random() * 3));
  const routeTiles = new Map<string, WireTile>([
    [cellKey(1, 1), { kind: 'H', owner: 'ROUTE CHECK' }],
    [cellKey(2, 1), { kind: 'ES', owner: 'ROUTE CHECK' }],
    [cellKey(2, 2), { kind: 'NE', owner: 'ROUTE CHECK' }],
    [cellKey(1, 3), { kind: 'H', owner: 'ROUTE CHECK' }],
    [cellKey(2, 3), { kind: 'H', owner: 'ROUTE CHECK' }],
    [cellKey(3, 3), { kind: 'WN', owner: 'ROUTE CHECK' }],
    [cellKey(4, 2), { kind: 'H', owner: 'ROUTE CHECK' }],
    [cellKey(5, 2), { kind: 'H', owner: 'ROUTE CHECK' }],
  ]);
  if (!calculatePower(routeTiles, level).powered.has('TARGET')) level.blocked = [];
  level.description = 'Power both AND inputs through randomized hull damage, then reach the drive.';
  return level;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function addBoard(state: GameState, createdBy: CircuitBoard['createdBy']): CircuitBoard {
  const id = state.nextBoardId++;
  const seed = mixSeed(state.runSeed, id);
  const board: CircuitBoard = {
    id, levelId: state.levelId, seed, level: generateLevel(state.levelId, seed),
    tiles: new Map(), powered: new Set(), gateInputs: new Set(), shorts: 0,
    shortCell: null, shortFlashTimer: 0, solved: false, placementCount: 0, lastActivityAt: null, createdBy,
  };
  state.boards.push(board);
  state.lastEvent = `BOARD B${id} online — ${LEVELS[state.levelId].title} relay opened (${createdBy}).`;
  return board;
}

function boardCapFor(activeCount: number): number {
  return Math.min(MAX_BOARDS_PER_RUN, Math.max(2, Math.ceil(activeCount / CHATTERS_PER_BOARD) + 1));
}

function updateBoardScaling(state: GameState): void {
  state.activeChatterCount = state.activeChatters.size;
  state.boardCapacity = Math.max(state.boardCapacity, boardCapFor(state.activeChatterCount));
  const chatterTarget = Math.max(1, Math.ceil(state.activeChatterCount / CHATTERS_PER_BOARD));
  state.desiredBoardCount = Math.max(state.desiredBoardCount, Math.min(state.boardCapacity, chatterTarget));
}

export function noteActiveChatter(state: GameState, chatterId: string, now = Date.now()): void {
  if (!chatterId || state.phase !== 'playing') return;
  state.activeChatters.set(chatterId, now);
  updateBoardScaling(state);
}

export function pruneActiveChatters(state: GameState, now = Date.now()): void {
  for (const [id, seenAt] of state.activeChatters) if (now - seenAt > CHATTER_WINDOW_MS) state.activeChatters.delete(id);
  updateBoardScaling(state);
}

export function parseWireCommand(input: string, owner: string): ParsedWireCommand | string {
  const match = input.trim().match(/^!b(\d+)\s+wire\s+([A-Ga-g][1-5])\s+(UP|DOWN|LEFT|RIGHT)\s+(UP|DOWN|LEFT|RIGHT)$/i);
  if (!match) return 'Use !b1 wire B3 LEFT RIGHT. Choose two different sides: UP, DOWN, LEFT, RIGHT.';
  const boardId = Number(match[1]);
  if (!Number.isSafeInteger(boardId) || boardId < 1) return 'Board ID must be a positive number, e.g. !b1 wire B3 LEFT RIGHT.';
  const column = match[2].toUpperCase().charCodeAt(0) - 65;
  const row = Number(match[2][1]) - 1;
  const first = directionToken(match[3]);
  const second = directionToken(match[4]);
  if (first === second) return 'A wire needs two different sides. Try !b1 wire B3 LEFT RIGHT.';
  const kind = PORT_TILE[[first, second].sort().join('')];
  return { boardId, column, row, kind, label: owner };
}

function directionToken(input: string): Direction {
  return ({ UP: 'N', DOWN: 'S', LEFT: 'W', RIGHT: 'E' } as const)[input.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'];
}

export function describePorts(kind: TileKind): string {
  const labels: Record<TileKind, string> = {
    H: 'LEFT + RIGHT', V: 'UP + DOWN', NE: 'UP + RIGHT', ES: 'RIGHT + DOWN', SW: 'DOWN + LEFT', WN: 'LEFT + UP',
  };
  return labels[kind];
}

function isFixedCell(level: LevelDefinition, cell: Cell): boolean {
  return level.sources.some((fixed) => isSame(fixed, cell)) || isSame(level.target, cell)
    || level.blocked.some((fixed) => isSame(fixed, cell)) || Boolean(level.gate && isSame(level.gate, cell));
}

export function placeWire(state: GameState, command: ParsedWireCommand): { accepted: boolean; message: string; short: boolean; replaced: boolean } {
  if (state.phase !== 'playing') return { accepted: false, message: 'Start the run before placing wires.', short: false, replaced: false };
  const board = state.boards.find((candidate) => candidate.id === command.boardId);
  if (!board) return { accepted: false, message: `Board B${command.boardId} is not active.`, short: false, replaced: false };
  const level = board.level;
  const key = cellKey(command.column, command.row);
  if (command.column < 0 || command.row < 0 || command.column >= level.columns || command.row >= level.rows) return { accepted: false, message: 'That cell is outside the board.', short: false, replaced: false };
  if (isFixedCell(level, command)) return { accepted: false, message: `${labelCell(command.column, command.row)} on B${board.id} is a fixed mission cell.`, short: false, replaced: false };
  const previous = board.tiles.get(key);
  const replaced = Boolean(previous);
  const causedShort = replaced && board.powered.has(key);
  const wasSolved = board.solved;
  if (causedShort) {
    board.shorts += 1;
    state.danger = Math.min(config.DANGER_MAX, state.danger + config.DANGER_SHORT_PENALTY);
    board.shortCell = key;
    board.shortFlashTimer = config.BOARD_SHORT_FLASH_SECONDS;
  }
  board.tiles.set(key, { kind: command.kind, owner: command.label });
  board.placementCount += 1;
  board.lastActivityAt = Date.now();
  const result = calculatePower(board.tiles, level);
  board.powered = result.powered;
  board.gateInputs = result.gateInputs;
  board.solved = result.powered.has('TARGET');
  if (causedShort) state.lastEvent = `SHORT on B${board.id} at ${labelCell(command.column, command.row)} — ${describePorts(command.kind)} replaced ${describePorts(previous!.kind)}; live wire hit!`;
  else if (!wasSolved && board.solved) {
    state.danger = Math.max(0, state.danger - config.DANGER_SOLVE_REDUCTION);
    state.lastEvent = `BOARD B${board.id} ONLINE — circuit stabilized.`;
  } else if (replaced) state.lastEvent = `B${board.id}: ${command.label} replaced ${describePorts(previous!.kind)} with ${describePorts(command.kind)} at ${labelCell(command.column, command.row)}.`;
  else state.lastEvent = `B${board.id}: ${command.label} placed a ${describePorts(command.kind)} wire at ${labelCell(command.column, command.row)}.`;
  return { accepted: true, message: state.lastEvent, short: causedShort, replaced };
}

export function beginRound(state: GameState): void {
  state.phase = 'playing';
  state.lastEvent = `B1 ${LEVELS[state.levelId].title} active. Route the circuit, then escape.`;
}

export function simulatePilotHit(state: GameState): void {
  if (state.phase !== 'playing') return;
  applyHit(state);
}

export function updateRound(state: GameState, deltaSeconds: number, movement: { x: number; y: number }): void {
  if (state.phase !== 'playing') return;
  const dt = Math.min(deltaSeconds, 0.05);
  const previousShipX = state.shipX;
  const previousShipY = state.shipY;
  state.elapsed += dt;
  state.hitCooldown = Math.max(0, state.hitCooldown - dt);
  state.hitBoardCooldown = Math.max(0, state.hitBoardCooldown - dt);
  state.boardSpawnTimer = Math.max(0, state.boardSpawnTimer - dt);
  state.chatterPruneTimer -= dt;
  if (state.chatterPruneTimer <= 0) {
    pruneActiveChatters(state);
    state.chatterPruneTimer = 1;
  }
  for (const board of state.boards) board.shortFlashTimer = Math.max(0, board.shortFlashTimer - dt);
  if (state.desiredBoardCount > state.boards.length && state.boardSpawnTimer <= 0) {
    addBoard(state, 'chat growth');
    state.boardSpawnTimer = BOARD_SPAWN_INTERVAL;
  }

  let allBoardsOnline = state.boards.length > 0 && state.boards.every((board) => board.solved);
  state.danger = Math.min(config.DANGER_MAX, state.danger + dt * (allBoardsOnline ? config.DANGER_DRAIN_PER_SECOND_ONLINE : config.DANGER_DRAIN_PER_SECOND));
  const speed = allBoardsOnline ? config.SHIP_SPEED_ONLINE : config.SHIP_SPEED;
  state.shipX = clamp(state.shipX + movement.x * speed * dt, FLIGHT_ARENA.x + 18, FLIGHT_ARENA.x + FLIGHT_ARENA.width - 18);
  state.shipY = clamp(state.shipY + movement.y * speed * dt, FLIGHT_ARENA.y + 18, FLIGHT_ARENA.y + FLIGHT_ARENA.height - 18);
  if (movement.x !== 0 || movement.y !== 0) state.shipAngle = Math.atan2(movement.y, movement.x);

  state.nextPatternIn -= dt;
  if (state.nextPatternIn <= 0) {
    spawnDanmakuPattern(state);
    const difficulty = Math.min(config.PATTERN_MAX_DIFFICULTY, Math.floor(state.elapsed / config.PATTERN_DIFFICULTY_TIER_SECONDS));
    state.nextPatternIn += Math.max(config.PATTERN_MIN_INTERVAL_SECONDS, config.PATTERN_BASE_INTERVAL_SECONDS - difficulty * config.PATTERN_DIFFICULTY_SPEEDUP_SECONDS);
  }
  for (const bullet of state.bullets) {
    bullet.previousX = bullet.x;
    bullet.previousY = bullet.y;
    bullet.x += bullet.velocityX * dt;
    bullet.y += bullet.velocityY * dt;
  }
  const margin = 28;
  state.bullets = state.bullets.filter((bullet) =>
    bullet.x >= FLIGHT_ARENA.x - margin && bullet.x <= FLIGHT_ARENA.x + FLIGHT_ARENA.width + margin
    && bullet.y >= FLIGHT_ARENA.y - margin && bullet.y <= FLIGHT_ARENA.y + FLIGHT_ARENA.height + margin);
  if (state.hitCooldown <= 0) {
    const hitIndex = state.bullets.findIndex((bullet) => projectileHitShip(bullet, previousShipX, previousShipY, state.shipX, state.shipY));
    if (hitIndex >= 0) {
      const hitBullet = state.bullets[hitIndex];
      state.bullets = state.bullets.filter((bullet) => bullet !== hitBullet && Math.hypot(bullet.x - state.shipX, bullet.y - state.shipY) > 34);
      applyHit(state);
      allBoardsOnline = state.boards.every((board) => board.solved);
    }
  }
  if (state.danger >= 100) {
    state.phase = 'lost';
    state.lastEvent = 'HULL FAILURE — the crew ran out of time.';
  } else if (allBoardsOnline && Math.abs(state.shipX - (FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2)) <= 64 && state.shipY <= FLIGHT_ARENA.y + 24) {
    state.phase = 'won';
    state.lastEvent = `ESCAPE — all ${state.boards.length} routing board${state.boards.length === 1 ? '' : 's'} stabilized.`;
  }
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }

function makeProjectile(x: number, y: number, angle: number, speed: number, color: number, diamond = false): Projectile {
  return {
    x, y, previousX: x, previousY: y,
    velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed,
    radius: diamond ? 5.5 : 5, color, diamond,
  };
}

function spawnDanmakuPattern(state: GameState): void {
  const pattern = state.patternIndex % 3;
  const side = (Math.floor(state.patternIndex / 3) + (state.runSeed % 4)) % 4;
  const difficulty = Math.min(config.PATTERN_MAX_DIFFICULTY, Math.floor(state.elapsed / config.PATTERN_DIFFICULTY_TIER_SECONDS));
  const speed = config.PATTERN_SPEED_BASE + difficulty * config.PATTERN_SPEED_PER_DIFFICULTY;
  const color = [0xff7597, 0xffc66e, 0x72d8ff, 0xb69aff][side];
  const left = FLIGHT_ARENA.x + 8;
  const right = FLIGHT_ARENA.x + FLIGHT_ARENA.width - 8;
  const top = FLIGHT_ARENA.y + 8;
  const bottom = FLIGHT_ARENA.y + FLIGHT_ARENA.height - 8;
  const sideOrigin = (): { x: number; y: number } => {
    switch (side) {
      case 0: return { x: left, y: top + FLIGHT_ARENA.height * 0.5 };
      case 1: return { x: left + FLIGHT_ARENA.width * 0.5, y: top };
      case 2: return { x: right, y: top + FLIGHT_ARENA.height * 0.5 };
      default: return { x: left + FLIGHT_ARENA.width * 0.5, y: bottom };
    }
  };

  if (pattern === 0) {
    const origin = sideOrigin();
    const centerAngle = Math.atan2(state.shipY - origin.y, state.shipX - origin.x);
    for (let i = -4; i <= 4; i++) state.bullets.push(makeProjectile(origin.x, origin.y, centerAngle + i * 0.11, speed, color));
  } else if (pattern === 1) {
    const offsetX = ((state.runSeed >>> 4) % 181) - 90;
    const offsetY = ((state.runSeed >>> 12) % 161) - 80;
    const originX = FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2 + offsetX;
    const originY = FLIGHT_ARENA.y + FLIGHT_ARENA.height / 2 + offsetY;
    const count = config.PATTERN_RADIAL_COUNT_BASE + difficulty * config.PATTERN_RADIAL_COUNT_PER_DIFFICULTY;
    const rotation = (state.patternIndex * 0.31 + (state.runSeed % 628) / 100) % (Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const angle = rotation + (Math.PI * 2 * i) / count;
      state.bullets.push(makeProjectile(originX, originY, angle, speed * config.PATTERN_RADIAL_SPEED_FACTOR, 0xc08cff, true));
    }
  } else {
    const fromHorizontalSide = side % 2 === 0;
    const openingCoordinate = fromHorizontalSide ? state.shipY : state.shipX;
    const span = fromHorizontalSide ? FLIGHT_ARENA.height : FLIGHT_ARENA.width;
    const start = fromHorizontalSide ? top : left;
    const spacing = span / 20;
    for (let i = 1; i < 20; i++) {
      const coordinate = start + i * spacing;
      if (Math.abs(coordinate - openingCoordinate) < config.PATTERN_SWEEP_OPENING_MARGIN) continue;
      let x: number; let y: number; let angle: number;
      if (side === 0) { x = left; y = coordinate; angle = 0; }
      else if (side === 1) { x = coordinate; y = top; angle = Math.PI / 2; }
      else if (side === 2) { x = right; y = coordinate; angle = Math.PI; }
      else { x = coordinate; y = bottom; angle = -Math.PI / 2; }
      state.bullets.push(makeProjectile(x, y, angle, speed * config.PATTERN_SWEEP_SPEED_FACTOR, 0x73e5cb, true));
    }
  }
  state.patternIndex += 1;
}

function projectileHitShip(bullet: Projectile, previousShipX: number, previousShipY: number, shipX: number, shipY: number): boolean {
  const startX = bullet.previousX - previousShipX;
  const startY = bullet.previousY - previousShipY;
  const endX = bullet.x - shipX;
  const endY = bullet.y - shipY;
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(-(startX * dx + startY * dy) / lengthSquared, 0, 1);
  const closestX = startX + dx * t;
  const closestY = startY + dy * t;
  const hitRadius = bullet.radius + 4.5;
  return closestX * closestX + closestY * closestY <= hitRadius * hitRadius;
}

function applyHit(state: GameState): void {
  const mayOpenBoard = state.hitBoardCooldown <= 0;
  state.hitCooldown = config.SHIP_HIT_COOLDOWN_SECONDS;
  if (mayOpenBoard) state.hitBoardCooldown = HIT_BOARD_COOLDOWN;
  state.danger = Math.min(config.DANGER_MAX, state.danger + config.DANGER_HIT_PENALTY);
  if (mayOpenBoard && state.boards.length < state.boardCapacity) {
    state.desiredBoardCount = Math.min(state.boardCapacity, Math.max(state.desiredBoardCount, state.boards.length + 1));
    addBoard(state, 'pilot hit');
    state.lastEvent = `IMPACT — hull +14%. New routing problem: B${state.boards[state.boards.length - 1].id}.`;
  } else {
    state.lastEvent = `IMPACT — hull +14%. ${state.boards.length >= state.boardCapacity ? 'Board capacity reached.' : 'No new board this hit.'}`;
  }
}

interface TraceResult { wires: Set<string>; gateSides: Set<Direction>; targetReached: boolean }

function traceWires(tiles: Map<string, WireTile>, level: LevelDefinition, start: LevelDefinition['sources'][number] | NonNullable<LevelDefinition['gate']>, detectGate: boolean, detectTarget: boolean): TraceResult {
  const result: TraceResult = { wires: new Set(), gateSides: new Set(), targetReached: false };
  const [startDx, startDy] = STEP[start.output];
  const queue: Array<Cell & { incoming: Direction }> = [{ column: start.column + startDx, row: start.row + startDy, incoming: OPPOSITE[start.output] }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.column < 0 || current.row < 0 || current.column >= level.columns || current.row >= level.rows) continue;
    if (isSame(current, level.target)) {
      if (detectTarget && current.incoming === level.targetEntry) result.targetReached = true;
      continue;
    }
    if (level.blocked.some((cell) => isSame(cell, current)) || level.sources.some((cell) => isSame(cell, current)) || (level.gate && isSame(level.gate, current))) continue;
    const key = keyFor(current);
    const tile = tiles.get(key);
    if (!tile || !PORTS[tile.kind].includes(current.incoming) || result.wires.has(key)) continue;
    result.wires.add(key);
    for (const port of PORTS[tile.kind]) {
      if (port === current.incoming) continue;
      const [dx, dy] = STEP[port];
      const next = { column: current.column + dx, row: current.row + dy };
      if (level.gate && isSame(next, level.gate)) {
        if (detectGate) {
          const side = OPPOSITE[port];
          if (level.gate.inputs.some((input) => input.side === side)) result.gateSides.add(side);
        }
        continue;
      }
      if (isSame(next, level.target)) {
        if (detectTarget && OPPOSITE[port] === level.targetEntry) result.targetReached = true;
        continue;
      }
      queue.push({ ...next, incoming: OPPOSITE[port] });
    }
  }
  return result;
}

function calculatePower(tiles: Map<string, WireTile>, level: LevelDefinition): { powered: Set<string>; gateInputs: Set<string> } {
  const powered = new Set<string>();
  const gateInputs = new Set<string>();
  if (!level.gate) {
    const trace = traceWires(tiles, level, level.sources[0], false, true);
    trace.wires.forEach((key) => powered.add(key));
    if (trace.targetReached) powered.add('TARGET');
    return { powered, gateInputs };
  }
  const traces = level.sources.map((source) => traceWires(tiles, level, source, true, false));
  traces.forEach((trace) => trace.wires.forEach((key) => powered.add(key)));
  level.sources.forEach((source, index) => {
    const input = level.gate!.inputs.find((candidate) => candidate.id === source.gateInput);
    if (input && traces[index].gateSides.has(input.side)) gateInputs.add(input.id);
  });
  if (gateInputs.size === level.gate.inputs.length) {
    powered.add(keyFor(level.gate));
    const output = traceWires(tiles, level, level.gate, false, true);
    output.wires.forEach((key) => powered.add(key));
    if (output.targetReached) powered.add('TARGET');
  }
  return { powered, gateInputs };
}
