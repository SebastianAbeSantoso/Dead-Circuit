// Central tuning constants for DEAD CIRCUIT.
// Edit here to balance the round without touching rule code.
//
// All values verified against current behavior in src/core/multiGame.ts:
// nothing changes numerically when multiGame.ts imports from this file.

export interface GameConfig {
  // --- Chatter / board scaling --------------------------------------------
  // Rolling window (ms) over which unique active chatters are counted.
  CHATTER_WINDOW_MS: number;
  // Roughly one board per this many unique active chatters.
  CHATTERS_PER_BOARD: number;
  // Hard cap on total boards in a run.
  MAX_BOARDS_PER_RUN: number;
  // Seconds between chat-driven board spawns.
  BOARD_SPAWN_INTERVAL_SECONDS: number;
  // Seconds cooldown before another hit-triggered board can be created.
  HIT_BOARD_COOLDOWN_SECONDS: number;

  // --- Danger --------------------------------------------------------------
  DANGER_MAX: number;
  // Danger added per second when not every board is online.
  DANGER_DRAIN_PER_SECOND: number;
  // Danger added per second when every board is online.
  DANGER_DRAIN_PER_SECOND_ONLINE: number;
  // Danger added when a live wire is replaced (short).
  DANGER_SHORT_PENALTY: number;
  // Danger removed when a board goes from unsolved -> solved.
  DANGER_SOLVE_REDUCTION: number;
  // Danger added when the ship is hit.
  DANGER_HIT_PENALTY: number;

  // --- Ship ----------------------------------------------------------------
  SHIP_SPEED: number;
  SHIP_SPEED_ONLINE: number;
  // Seconds of invulnerability after a hit.
  SHIP_HIT_COOLDOWN_SECONDS: number;

  // --- Danmaku patterns ----------------------------------------------------
  // Seconds before the first pattern spawns.
  PATTERN_INITIAL_DELAY_SECONDS: number;
  // Base seconds between patterns (before difficulty adjustment).
  PATTERN_BASE_INTERVAL_SECONDS: number;
  // Minimum seconds between patterns (difficulty clamp floor).
  PATTERN_MIN_INTERVAL_SECONDS: number;
  // Seconds subtracted from interval per difficulty tier.
  PATTERN_DIFFICULTY_SPEEDUP_SECONDS: number;
  // Seconds of elapsed time per difficulty tier.
  PATTERN_DIFFICULTY_TIER_SECONDS: number;
  // Max difficulty tier index.
  PATTERN_MAX_DIFFICULTY: number;

  // Pattern speeds (pixels / second).
  PATTERN_SPEED_BASE: number;
  PATTERN_SPEED_PER_DIFFICULTY: number;
  PATTERN_RADIAL_SPEED_FACTOR: number;
  PATTERN_SWEEP_SPEED_FACTOR: number;

  // Pattern counts.
  PATTERN_RADIAL_COUNT_BASE: number;
  PATTERN_RADIAL_COUNT_PER_DIFFICULTY: number;

  // Sweep opening margin (pixels around the ship left clear).
  PATTERN_SWEEP_OPENING_MARGIN: number;

  // --- Board visuals -------------------------------------------------------
  // Seconds a shorted cell flashes red.
  BOARD_SHORT_FLASH_SECONDS: number;
}

export const GAME_CONFIG: GameConfig = {
  CHATTER_WINDOW_MS: 120_000,
  CHATTERS_PER_BOARD: 100,
  MAX_BOARDS_PER_RUN: 100,
  BOARD_SPAWN_INTERVAL_SECONDS: 0.75,
  HIT_BOARD_COOLDOWN_SECONDS: 8,

  DANGER_MAX: 100,
  DANGER_DRAIN_PER_SECOND: 1.25,
  DANGER_DRAIN_PER_SECOND_ONLINE: 0.25,
  DANGER_SHORT_PENALTY: 22,
  DANGER_SOLVE_REDUCTION: 18,
  DANGER_HIT_PENALTY: 14,

  SHIP_SPEED: 230,
  SHIP_SPEED_ONLINE: 270,
  SHIP_HIT_COOLDOWN_SECONDS: 1.15,

  PATTERN_INITIAL_DELAY_SECONDS: 1.1,
  PATTERN_BASE_INTERVAL_SECONDS: 1.85,
  PATTERN_MIN_INTERVAL_SECONDS: 1.55,
  PATTERN_DIFFICULTY_SPEEDUP_SECONDS: 0.12,
  PATTERN_DIFFICULTY_TIER_SECONDS: 35,
  PATTERN_MAX_DIFFICULTY: 2,

  PATTERN_SPEED_BASE: 132,
  PATTERN_SPEED_PER_DIFFICULTY: 13,
  PATTERN_RADIAL_SPEED_FACTOR: 0.78,
  PATTERN_SWEEP_SPEED_FACTOR: 0.72,

  PATTERN_RADIAL_COUNT_BASE: 16,
  PATTERN_RADIAL_COUNT_PER_DIFFICULTY: 2,

  PATTERN_SWEEP_OPENING_MARGIN: 74,

  BOARD_SHORT_FLASH_SECONDS: 0.65,
} as const;
