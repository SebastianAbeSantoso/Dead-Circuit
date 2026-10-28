import { GAME_CONFIG as config } from './config';
import {
  BOARD_SIZE, LEVELS, cellKey,
  type Cell, type Direction, type LevelDefinition, type LevelId, type TileKind, type WireTile,
} from './game';

export type RoundPhase = 'ready' | 'playing' | 'won' | 'lost';
export type PartId = 'engine' | 'hull' | 'avionics';
export type PartLevel = 0 | 1 | 2 | 3;
export interface PlanePart { id: PartId; level: PartLevel }
export interface PlaneState { parts: Map<PartId, PlanePart>; destroyedCount: number; repairCredits: number }
export interface PartStateEvent {
  type: 'hit' | 'repaired';
  partId: PartId;
  previousLevel: PartLevel;
  newLevel: PartLevel;
}
export interface PlaneMultipliers {
  speedMult: number;
  invulnSeconds: number;
  turnMult: number;
  attackRateMult: number;
  commandCooldownMult: number;
  shakeMult: number;
}
export interface Projectile {
  x: number; y: number; previousX: number; previousY: number;
  velocityX: number; velocityY: number; radius: number; color: number; diamond: boolean;
}
export const FLIGHT_ARENA = { x: 808, y: 108, width: 760, height: 760 } as const;
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
  repairAwarded: boolean;
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
  plane: PlaneState;
  commandCooldowns: Map<string, number>;
  partEvents: PartStateEvent[];
  shipX: number;
  shipY: number;
  shipVelocityX: number;
  shipVelocityY: number;
  shipAngle: number;
  bullets: Projectile[];
  nextPatternIn: number;
  patternIndex: number;
  lastPattern: number;
  hitCooldown: number;
  elapsed: number;
  lastEvent: string;
}
export interface ParsedWireCommand extends Cell { boardId: number; kind: TileKind; label: string; actorId: string }

export const PART_IDS: PartId[] = ['engine', 'hull', 'avionics'];
export const PART_LABELS: Record<PartId, string> = {
  engine: 'ENGINE', hull: 'HULL', avionics: 'AVIONICS',
};
const PART_LEVEL_NAMES = ['OPERATIONAL', 'DAMAGED', 'CRITICAL', 'DESTROYED'] as const;

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
    boardSpawnTimer: 0, chatterPruneTimer: 1, hitBoardCooldown: 0,
    plane: { parts: new Map(PART_IDS.map((id) => [id, { id, level: 0 as PartLevel }])), destroyedCount: 0, repairCredits: 0 },
    commandCooldowns: new Map(), partEvents: [],
    shipX: FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2, shipY: FLIGHT_ARENA.y + FLIGHT_ARENA.height - 42, shipAngle: -Math.PI / 2,
    shipVelocityX: 0, shipVelocityY: 0,
    bullets: [], nextPatternIn: config.PATTERN_INITIAL_DELAY_SECONDS, patternIndex: 0, lastPattern: -1, hitCooldown: 0, elapsed: 0,
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
function findPath(
  start: Cell, goal: Cell, blocked: Cell[], forbidden: Cell[], seed: number,
  firstDirection?: Direction, arrivalDirection?: Direction,
): Cell[] | null {
  const random = seededRandom(seed);
  const open: SearchNode[] = [{ ...start, incoming: null, cost: 0, estimate: manhattan(start, goal), path: [{ ...start }] }];
  const best = new Map<string, number>();
  let steps = 0;
  while (open.length && steps++ < BOARD_SIZE.columns * BOARD_SIZE.rows * 16) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) if (open[i].estimate < open[bestIndex].estimate) bestIndex = i;
    const [current] = open.splice(bestIndex, 1);
    if (isSame(current, goal) && (!arrivalDirection || current.incoming === arrivalDirection)) return current.path;
    for (const direction of DIRECTIONS) {
      if (current.incoming === null && firstDirection && direction !== firstDirection) continue;
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

function countTurns(path: Cell[]): number {
  let turns = 0;
  let previous: Direction | null = null;
  for (let index = 1; index < path.length; index++) {
    const direction = directionBetween(path[index - 1], path[index]);
    if (previous && previous !== direction) turns++;
    previous = direction;
  }
  return turns;
}

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

/** Generate a deterministic candidate and prove it with the same signal rules used during play. */
export function generateLevelForSeed(levelId: LevelId, seed: number): LevelDefinition {
  const random = seededRandom(seed);
  const fallback = copyLevel(levelId);
  for (let attempt = 0; attempt < 96; attempt++) {
    const candidate = copyLevel(levelId);
    candidate.sources = candidate.sources.map((source) => ({
      ...source,
      column: Math.floor(random() * 3),
      row: Math.floor(random() * candidate.rows),
    }));
    candidate.target = { column: 4 + Math.floor(random() * 3), row: Math.floor(random() * candidate.rows) };
    if (candidate.sources.some((source) => isSame(source, candidate.target))) continue;
    const cells = [...candidate.sources, candidate.target];
    if (cells.some((cell, index) => cells.slice(index + 1).some((other) => isSame(cell, other)))) continue;

    if (levelId === 'standard') {
      const source = candidate.sources[0];
      const hull = { column: 2 + Math.floor(random() * 3), row: Math.floor(random() * candidate.rows) };
      if (cells.some((cell) => isSame(cell, hull))) continue;
      const route = findPath(source, candidate.target, [hull], [], seed ^ Math.imul(attempt + 1, 0x45d9f3b), source.output, 'E');
      if (!route || route.length < Math.min(5, manhattan(source, candidate.target) + 3) || route.length > 13 || countTurns(route) > 4) continue;
      candidate.blocked = [hull];
      const reserved = new Set(route.map(keyFor));
      const obstacles = freeCells(candidate).filter((cell) => !reserved.has(keyFor(cell)) && !cells.some((special) => isSame(special, cell)));
      shuffle(obstacles, random);
      const optionalCount = Math.floor(random() * 3);
      for (const cell of obstacles) {
        if (candidate.blocked.length >= optionalCount + 1) break;
        if (candidate.blocked.some((other) => manhattan(cell, other) < 2) || cells.some((special) => manhattan(cell, special) < 2)) continue;
        candidate.blocked.push(cell);
      }
      const verificationRoute = findPath(source, candidate.target, candidate.blocked, [], seed ^ 0xa511e9b3, source.output, 'E');
      if (!verificationRoute || !calculatePower(tilesForPath(verificationRoute), candidate).powered.has('TARGET')) continue;
      candidate.description = `Route CORE to DRIVE around hull damage (${labelCell(hull.column, hull.row)}).`;
      return candidate;
    }

    const gateColumn = 2 + Math.floor(random() * 3);
    const gateRow = Math.floor(random() * candidate.rows);
    candidate.gate = { column: gateColumn, row: gateRow, output: 'E', inputs: [] };
    if ([...candidate.sources, candidate.target].some((cell) => isSame(cell, candidate.gate!))) continue;
    const inputSideOptions: Direction[] = ['W', 'N', 'S'];
    shuffle(inputSideOptions, random);
    const inputSides = inputSideOptions.slice(0, 2);
    candidate.gate.inputs = inputSides.map((side, index) => {
      const [dx, dy] = STEP[side];
      return { id: index === 0 ? 'A' : 'B', side, neighbor: { column: gateColumn + dx, row: gateRow + dy } };
    });
    const usedGateSides = new Set(inputSides);
    const outputOptions = DIRECTIONS.filter((side) => !usedGateSides.has(side));
    candidate.gate.output = outputOptions[Math.floor(random() * outputOptions.length)];
    if (candidate.gate.output !== 'E' && random() < 0.7) candidate.gate.output = 'E';
    if (candidate.gate.output === 'E' && inputSides.includes('E')) continue;
    const allSpecial = [...candidate.sources, candidate.target, candidate.gate];
    if (allSpecial.some((cell, index) => allSpecial.slice(index + 1).some((other) => isSame(cell, other)))) continue;
    if (candidate.gate.inputs.some((input) => input.neighbor.column < 0 || input.neighbor.row < 0 || input.neighbor.column >= candidate.columns || input.neighbor.row >= candidate.rows)) continue;

    let reserved = new Set<string>();
    const routeTiles = new Map<string, WireTile>();
    let valid = true;
    for (let index = 0; index < candidate.sources.length; index++) {
      const source = candidate.sources[index];
      const input = candidate.gate.inputs.find((entry) => entry.id === source.gateInput);
      if (!input) { valid = false; break; }
      const forbidden = [...reserved].map((key) => {
        const [column, row] = key.split(',').map(Number);
        return { column, row };
      }).concat(candidate.sources.filter((other) => other !== source), [candidate.target]);
      const arrival = OPPOSITE[input.side];
      const route = findPath(source, candidate.gate, [], forbidden, seed ^ Math.imul(attempt + index + 1, 0x27d4eb2d), source.output, arrival);
      if (!route || route.length < 3 || route.length > 13 || countTurns(route) > 4) { valid = false; break; }
      route.forEach((cell) => reserved.add(keyFor(cell)));
      for (const [key, tile] of tilesForPath(route).entries()) {
        if (routeTiles.has(key)) { valid = false; break; }
        routeTiles.set(key, tile);
      }
    }
    if (!valid) continue;
    const forbiddenOutput = [...reserved].map((key) => {
      const [column, row] = key.split(',').map(Number);
      return { column, row };
    }).concat(candidate.sources, [candidate.target]);
    const outputRoute = findPath(candidate.gate, candidate.target, [], forbiddenOutput, seed ^ 0x68bc21eb, candidate.gate.output, 'E');
    if (!outputRoute || outputRoute.length < 3 || outputRoute.length > 13 || countTurns(outputRoute) > 4) continue;
    for (const [key, tile] of tilesForPath(outputRoute).entries()) {
      if (routeTiles.has(key)) { valid = false; break; }
      routeTiles.set(key, tile);
      reserved.add(key);
    }
    if (!valid) continue;
    if (!calculatePower(routeTiles, candidate).powered.has('TARGET')) continue;
    const obstacles = freeCells(candidate).filter((cell) => !reserved.has(keyFor(cell)) && !allSpecial.some((special) => isSame(special, cell)));
    shuffle(obstacles, random);
    const optionalCount = Math.floor(random() * 3);
    candidate.blocked = [];
    for (const cell of obstacles) {
      if (candidate.blocked.length >= optionalCount) break;
      if (candidate.blocked.some((other) => manhattan(cell, other) < 2) || allSpecial.some((special) => manhattan(cell, special) < 2)) continue;
      candidate.blocked.push(cell);
    }
    if (!calculatePower(routeTiles, candidate).powered.has('TARGET')) continue;
    candidate.description = 'Power both AND inputs through hull damage, then reach the drive.';
    return candidate;
  }

  // Defensive fallback stays deterministic and is itself checked before use.
  if (levelId === 'standard') {
    const route = findPath(fallback.sources[0], fallback.target, fallback.blocked, [], seed, fallback.sources[0].output, 'E');
    if (route && calculatePower(tilesForPath(route), fallback).powered.has('TARGET')) return fallback;
  } else {
    fallback.blocked = [];
    const routes = [
      [{ column: 0, row: 1 }, { column: 1, row: 1 }, { column: 2, row: 1 }, { column: 2, row: 2 }, { column: 3, row: 2 }],
      [{ column: 0, row: 3 }, { column: 1, row: 3 }, { column: 2, row: 3 }, { column: 3, row: 3 }, { column: 3, row: 2 }],
      [{ column: 3, row: 2 }, { column: 4, row: 2 }, { column: 5, row: 2 }, { column: 6, row: 2 }],
    ];
    const routeTiles = new Map<string, WireTile>();
    for (const route of routes) for (const [key, tile] of tilesForPath(route).entries()) routeTiles.set(key, tile);
    if (calculatePower(routeTiles, fallback).powered.has('TARGET')) return fallback;
  }
  throw new Error(`Unable to create a valid ${levelId} layout for seed ${seed}.`);
}

function freeCells(level: LevelDefinition): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < level.rows; row++) for (let column = 0; column < level.columns; column++) cells.push({ column, row });
  return cells;
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
    id, levelId: state.levelId, seed, level: generateLevelForSeed(state.levelId, seed),
    tiles: new Map(), powered: new Set(), gateInputs: new Set(), shorts: 0,
    shortCell: null, shortFlashTimer: 0, solved: false, repairAwarded: false, placementCount: 0, lastActivityAt: null, createdBy,
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

export function parseWireCommand(input: string, owner: string, actorId = owner): ParsedWireCommand | string {
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
  return { boardId, column, row, kind, label: owner, actorId };
}

export function parseRepairCommand(input: string): PartId | string | null {
  const trimmed = input.trim();
  if (!/^!repair(?:\s|$)/i.test(trimmed)) return null;
  const match = trimmed.match(/^!repair\s+([a-z_ -]+)$/i);
  if (!match) return 'Use !repair engine. A solved board earns one repair reserve.';
  const partId = match[1].toLowerCase().replace(/[ -]+/g, '_') as PartId;
  if (!PART_IDS.includes(partId)) return 'Unknown part. Repair: engine, hull, avionics, fuel, comms, or life support.';
  return partId;
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
  const cooldownMessage = consumeCommandCooldown(state, command.actorId, command.label);
  if (cooldownMessage) return { accepted: false, message: cooldownMessage, short: false, replaced: false };
  const previous = board.tiles.get(key);
  const replaced = Boolean(previous);
  const causedShort = replaced && board.powered.has(key);
  const wasSolved = board.solved;
  if (causedShort) {
    board.shorts += 1;
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
    if (!board.repairAwarded && state.plane.repairCredits < config.MAX_REPAIR_CREDITS) state.plane.repairCredits += 1;
    board.repairAwarded = true;
    state.lastEvent = `BOARD B${board.id} ONLINE — repair reserve ${state.plane.repairCredits}/${config.MAX_REPAIR_CREDITS}.`;
  } else if (replaced) state.lastEvent = `B${board.id}: ${command.label} replaced ${describePorts(previous!.kind)} with ${describePorts(command.kind)} at ${labelCell(command.column, command.row)}.`;
  else state.lastEvent = `B${board.id}: ${command.label} placed a ${describePorts(command.kind)} wire at ${labelCell(command.column, command.row)}.`;
  if (causedShort) {
    const shortMessage = state.lastEvent;
    const impact = damageRandomPart(state);
    if (impact) {
      state.lastEvent = isPlaneDestroyed(state)
        ? `${shortMessage} ${state.lastEvent}`
        : `${shortMessage} IMPACT — ${PART_LABELS[impact.partId]} ${PART_LEVEL_NAMES[impact.newLevel]}.`;
    }
  }
  return { accepted: true, message: state.lastEvent, short: causedShort, replaced };
}

export function damageRandomPart(state: GameState): PartStateEvent | null {
  const partId = PART_IDS[Math.floor(Math.random() * PART_IDS.length)];
  const part = state.plane.parts.get(partId);
  if (!part || part.level >= 3) return null;
  const previousLevel = part.level;
  part.level = (part.level + 1) as PartLevel;
  state.plane.destroyedCount = PART_IDS.filter((id) => state.plane.parts.get(id)?.level === 3).length;
  const event: PartStateEvent = { type: 'hit', partId, previousLevel, newLevel: part.level };
  state.partEvents.push(event);
  state.lastEvent = `IMPACT — ${PART_LABELS[partId]} ${PART_LEVEL_NAMES[part.level]}.`;
  if (isPlaneDestroyed(state)) {
    state.phase = 'lost';
    state.lastEvent = 'TOTAL SYSTEM FAILURE — all six aircraft systems are destroyed.';
  }
  return event;
}

export function repairPart(state: GameState, partId: PartId, actorId = 'CHAT', displayName = actorId): PartStateEvent | null {
  const part = state.plane.parts.get(partId);
  if (state.phase !== 'playing') {
    state.lastEvent = 'Start a run before repairing aircraft systems.';
    return null;
  }
  if (!part || part.level === 0) {
    state.lastEvent = `${PART_LABELS[partId]} is already operational.`;
    return null;
  }
  if (state.plane.repairCredits <= 0) {
    state.lastEvent = 'No repair reserve. Power a routing board to earn one.';
    return null;
  }
  const cooldownMessage = consumeCommandCooldown(state, actorId, displayName);
  if (cooldownMessage) {
    state.lastEvent = cooldownMessage;
    return null;
  }
  const previousLevel = part.level;
  part.level = (part.level - 1) as PartLevel;
  state.plane.repairCredits -= 1;
  state.plane.destroyedCount = PART_IDS.filter((id) => state.plane.parts.get(id)?.level === 3).length;
  const event: PartStateEvent = { type: 'repaired', partId, previousLevel, newLevel: part.level };
  state.partEvents.push(event);
  state.lastEvent = `REPAIR — ${PART_LABELS[partId]} restored to ${PART_LEVEL_NAMES[part.level]}.`;
  return event;
}

export function computePlaneMultipliers(state: GameState): PlaneMultipliers {
  const levelFor = (partId: PartId) => state.plane.parts.get(partId)?.level ?? 0;
  const at = (values: readonly number[], partId: PartId) => values[levelFor(partId)] ?? values[0];
  return {
    speedMult: at(config.PLANE_ENGINE_SPEED_MULTIPLIERS, 'engine'),
    invulnSeconds: at(config.PLANE_HULL_INVULN_SECONDS, 'hull'),
    turnMult: at(config.PLANE_AVIONICS_TURN_MULTIPLIERS, 'avionics'),
    attackRateMult: 1,
    commandCooldownMult: 1,
    shakeMult: 1,
  };
}

export function isPlaneDestroyed(state: GameState): boolean {
  return state.plane.destroyedCount >= PART_IDS.length;
}

function consumeCommandCooldown(state: GameState, actorId: string, displayName = actorId): string | null {
  const multipliers = computePlaneMultipliers(state);
  const lastCommandAt = state.commandCooldowns.get(actorId);
  const required = config.CHAT_COMMAND_COOLDOWN_SECONDS * multipliers.commandCooldownMult;
  if (lastCommandAt !== undefined && state.elapsed - lastCommandAt < required) {
    const wait = Math.max(1, Math.ceil(required - (state.elapsed - lastCommandAt)));
    return `COMMS DAMAGED — @${displayName} wait ${wait}s before the next command.`;
  }
  state.commandCooldowns.set(actorId, state.elapsed);
  return null;
}

export function beginRound(state: GameState): void {
  state.phase = 'playing';
  state.lastEvent = 'SORTIE ACTIVE';
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

  const allBoardsOnline = state.boards.length > 0 && state.boards.every((board) => board.solved);
  const multipliers = computePlaneMultipliers(state);
  const speed = (allBoardsOnline ? config.SHIP_SPEED_ONLINE : config.SHIP_SPEED) * multipliers.speedMult;
  const steer = 1 - Math.exp(-config.SHIP_STEERING_RATE * multipliers.turnMult * dt);
  state.shipVelocityX += (movement.x * speed - state.shipVelocityX) * steer;
  state.shipVelocityY += (movement.y * speed - state.shipVelocityY) * steer;
  state.shipX = clamp(state.shipX + state.shipVelocityX * dt, FLIGHT_ARENA.x + 18, FLIGHT_ARENA.x + FLIGHT_ARENA.width - 18);
  state.shipY = clamp(state.shipY + state.shipVelocityY * dt, FLIGHT_ARENA.y + 18, FLIGHT_ARENA.y + FLIGHT_ARENA.height - 18);
  if (state.shipX === FLIGHT_ARENA.x + 18 || state.shipX === FLIGHT_ARENA.x + FLIGHT_ARENA.width - 18) state.shipVelocityX = 0;
  if (state.shipY === FLIGHT_ARENA.y + 18 || state.shipY === FLIGHT_ARENA.y + FLIGHT_ARENA.height - 18) state.shipVelocityY = 0;
  if (Math.hypot(state.shipVelocityX, state.shipVelocityY) > 12) state.shipAngle = Math.atan2(state.shipVelocityY, state.shipVelocityX);

  state.nextPatternIn -= dt;
  if (state.nextPatternIn <= 0) {
    spawnDanmakuPattern(state);
    const difficulty = Math.min(config.PATTERN_MAX_DIFFICULTY, Math.floor(state.elapsed / config.PATTERN_DIFFICULTY_TIER_SECONDS));
    state.nextPatternIn += Math.max(config.PATTERN_MIN_INTERVAL_SECONDS, config.PATTERN_BASE_INTERVAL_SECONDS - difficulty * config.PATTERN_DIFFICULTY_SPEEDUP_SECONDS) / multipliers.attackRateMult;
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
    }
  }
  if (isPlaneDestroyed(state)) {
    state.phase = 'lost';
    state.lastEvent = 'TOTAL SYSTEM FAILURE — all six aircraft systems are destroyed.';
  } else if (allBoardsOnline && Math.abs(state.shipX - (FLIGHT_ARENA.x + FLIGHT_ARENA.width / 2)) <= 64 && state.shipY <= FLIGHT_ARENA.y + 24) {
    state.phase = 'won';
    state.lastEvent = `ESCAPE — all ${state.boards.length} routing board${state.boards.length === 1 ? '' : 's'} stabilized.`;
  }
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }

function makeProjectile(x: number, y: number, angle: number, speed: number, color: number, radius: number, diamond = false): Projectile {
  return {
    x, y, previousX: x, previousY: y,
    velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed,
    radius, color, diamond,
  };
}

function spawnDanmakuPattern(state: GameState): void {
  const random = seededRandom(mixSeed(state.runSeed ^ 0x6d2b79f5, state.patternIndex));
  let pattern = Math.floor(random() * 4);
  if (pattern === state.lastPattern) pattern = (pattern + 1 + Math.floor(random() * 3)) % 4;
  state.lastPattern = pattern;
  const side = Math.floor(random() * 4);
  const difficulty = Math.min(config.PATTERN_MAX_DIFFICULTY, Math.floor(state.elapsed / config.PATTERN_DIFFICULTY_TIER_SECONDS));
  const color = [0xff7597, 0xffc66e, 0x72d8ff, 0xb69aff][side];
  const left = FLIGHT_ARENA.x + 8;
  const right = FLIGHT_ARENA.x + FLIGHT_ARENA.width - 8;
  const top = FLIGHT_ARENA.y + 8;
  const bottom = FLIGHT_ARENA.y + FLIGHT_ARENA.height - 8;
  const safe = (x: number, y: number) => Math.hypot(x - state.shipX, y - state.shipY) >= config.PATTERN_NO_SPAWN_RADIUS;
  const perimeter: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    perimeter.push({ x: left, y: top + t * (bottom - top) }, { x: right, y: top + t * (bottom - top) });
    perimeter.push({ x: left + t * (right - left), y: top }, { x: left + t * (right - left), y: bottom });
  }
  const safeEmitters = perimeter.filter((point) => safe(point.x, point.y));
  if (safeEmitters.length === 0) { state.patternIndex += 1; return; }
  const emitter = safeEmitters[Math.floor(random() * safeEmitters.length)];
  const difficultySpeed = difficulty * 7;

  if (pattern === 0) {
    // Fine, fast fan. Every lane starts far enough from the ship to preserve reaction time.
    const origin = emitter;
    const centerAngle = Math.atan2(state.shipY - origin.y, state.shipX - origin.x);
    for (let i = -4; i <= 4; i++) state.bullets.push(makeProjectile(origin.x, origin.y, centerAngle + i * 0.105, config.PATTERN_NEEDLE_SPEED + difficultySpeed, color, 3.4));
  } else if (pattern === 1) {
    // Slow heavy rounds arrive in a loose stream, keeping clear gaps between them.
    const count = 5 + difficulty;
    for (let i = 0; i < count; i++) {
      const origin = safeEmitters[Math.floor(random() * safeEmitters.length)] ?? emitter;
      const angle = Math.atan2(state.shipY - origin.y, state.shipX - origin.x) + (random() - 0.5) * 0.48;
      state.bullets.push(makeProjectile(origin.x, origin.y, angle, config.PATTERN_HEAVY_SPEED + difficulty * 4, 0xffaa73, 7.2, true));
    }
  } else if (pattern === 2) {
    // Radial spokes from a perimeter emitter, never from beside the ship.
    const count = config.PATTERN_RADIAL_COUNT_BASE + difficulty * config.PATTERN_RADIAL_COUNT_PER_DIFFICULTY;
    const rotation = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = rotation + (Math.PI * 2 * i) / count;
      state.bullets.push(makeProjectile(emitter.x, emitter.y, angle, config.PATTERN_RADIAL_SPEED + difficulty * 4, 0xc08cff, 4.5, true));
    }
  } else {
    // Edge rake leaves a broad gap around the pilot's current lane.
    const fromVerticalEdge = side % 2 === 0;
    const openingCoordinate = fromVerticalEdge ? state.shipY : state.shipX;
    const span = fromVerticalEdge ? FLIGHT_ARENA.height : FLIGHT_ARENA.width;
    const start = fromVerticalEdge ? top : left;
    const count = 14;
    const spacing = span / (count + 1);
    for (let i = 1; i <= count; i++) {
      const coordinate = start + i * spacing;
      if (Math.abs(coordinate - openingCoordinate) < config.PATTERN_SWEEP_OPENING_MARGIN) continue;
      let x: number; let y: number; let angle: number;
      if (side === 0) { x = left; y = coordinate; angle = 0; }
      else if (side === 1) { x = coordinate; y = top; angle = Math.PI / 2; }
      else if (side === 2) { x = right; y = coordinate; angle = Math.PI; }
      else { x = coordinate; y = bottom; angle = -Math.PI / 2; }
      if (safe(x, y)) state.bullets.push(makeProjectile(x, y, angle, config.PATTERN_RAKE_SPEED + difficulty * 5, 0x73e5cb, 4.7, true));
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
  state.hitCooldown = computePlaneMultipliers(state).invulnSeconds;
  if (mayOpenBoard) state.hitBoardCooldown = HIT_BOARD_COOLDOWN;
  const event = damageRandomPart(state);
  if (state.phase === 'lost') return;
  if (mayOpenBoard && state.boards.length < state.boardCapacity) {
    state.desiredBoardCount = Math.min(state.boardCapacity, Math.max(state.desiredBoardCount, state.boards.length + 1));
    addBoard(state, 'pilot hit');
    if (event) state.lastEvent = `IMPACT — ${PART_LABELS[event.partId]} ${PART_LEVEL_NAMES[event.newLevel]}.`;
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

export function calculatePower(tiles: Map<string, WireTile>, level: LevelDefinition): { powered: Set<string>; gateInputs: Set<string> } {
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
