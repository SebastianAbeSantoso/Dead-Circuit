export type TileKind = 'H' | 'V' | 'NE' | 'ES' | 'SW' | 'WN';
export type LevelId = 'standard' | 'logic';
export type Direction = 'N' | 'E' | 'S' | 'W';

export interface Cell { column: number; row: number }
export interface WireTile { kind: TileKind; owner: string }
export interface SourceDefinition extends Cell { label: string; output: Direction; gateInput?: string }
export interface GateInputDefinition { id: string; side: Direction; neighbor: Cell }
export interface GateDefinition extends Cell { inputs: GateInputDefinition[]; output: Direction }
export interface LevelDefinition {
  id: LevelId;
  title: string;
  missionLabel: string;
  description: string;
  columns: number;
  rows: number;
  sources: SourceDefinition[];
  target: Cell;
  targetEntry: Direction;
  blocked: Cell[];
  gate?: GateDefinition;
}

export const BOARD_SIZE = { columns: 7, rows: 5 } as const;
export const TILE_KINDS: TileKind[] = ['H', 'V', 'NE', 'ES', 'SW', 'WN'];

/** Reusable board templates; individual instances receive seeded layouts in multiGame.ts. */
export const LEVELS: Record<LevelId, LevelDefinition> = {
  standard: {
    id: 'standard', title: 'Standard Routing', missionLabel: 'STANDARD ROUTING',
    description: 'Route one signal around randomized hull damage.',
    columns: BOARD_SIZE.columns, rows: BOARD_SIZE.rows,
    sources: [{ column: 0, row: 2, label: 'CORE', output: 'E' }],
    target: { column: 6, row: 2 }, targetEntry: 'W', blocked: [{ column: 3, row: 2 }],
  },
  logic: {
    id: 'logic', title: 'Logic Gate Routing', missionLabel: 'AND GATE ROUTING',
    description: 'Power both AND inputs, then route its output to the drive.',
    columns: BOARD_SIZE.columns, rows: BOARD_SIZE.rows,
    sources: [
      { column: 0, row: 1, label: 'INPUT A', output: 'E', gateInput: 'A' },
      { column: 0, row: 3, label: 'INPUT B', output: 'E', gateInput: 'B' },
    ],
    target: { column: 6, row: 2 }, targetEntry: 'W', blocked: [],
    gate: {
      column: 3, row: 2, output: 'E',
      inputs: [
        { id: 'A', side: 'W', neighbor: { column: 2, row: 2 } },
        { id: 'B', side: 'S', neighbor: { column: 3, row: 3 } },
      ],
    },
  },
};

export const cellKey = (column: number, row: number) => `${column},${row}`;
