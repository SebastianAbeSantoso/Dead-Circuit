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

  // --- Ship ----------------------------------------------------------------
  SHIP_SPEED: number;
  SHIP_SPEED_ONLINE: number;
  // How quickly the plane can redirect its current velocity toward new input.
  SHIP_STEERING_RATE: number;
  // Base per-viewer chat command cooldown before Comms damage multiplies it.
  CHAT_COMMAND_COOLDOWN_SECONDS: number;
  MAX_REPAIR_CREDITS: number;
  // Plane part multipliers indexed by damage state 0..3.
  PLANE_ENGINE_SPEED_MULTIPLIERS: readonly number[];
  PLANE_HULL_INVULN_SECONDS: readonly number[];
  PLANE_AVIONICS_TURN_MULTIPLIERS: readonly number[];
  PLANE_FUEL_ATTACK_RATE_MULTIPLIERS: readonly number[];
  PLANE_COMMS_COMMAND_COOLDOWN_MULTIPLIERS: readonly number[];
  PLANE_LIFE_SUPPORT_SHAKE_MULTIPLIERS: readonly number[];

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
  PATTERN_NO_SPAWN_RADIUS: number;
  PATTERN_NEEDLE_SPEED: number;
  PATTERN_HEAVY_SPEED: number;
  PATTERN_RADIAL_SPEED: number;
  PATTERN_RAKE_SPEED: number;

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

  SHIP_SPEED: 230,
  SHIP_SPEED_ONLINE: 270,
  SHIP_STEERING_RATE: 8.5,
  CHAT_COMMAND_COOLDOWN_SECONDS: 0.85,
  MAX_REPAIR_CREDITS: 3,
  PLANE_ENGINE_SPEED_MULTIPLIERS: [1, 0.85, 0.7, 0.5],
  PLANE_HULL_INVULN_SECONDS: [1.15, 0.9, 0.6, 0.3],
  PLANE_AVIONICS_TURN_MULTIPLIERS: [1, 0.8, 0.6, 0.4],
  PLANE_FUEL_ATTACK_RATE_MULTIPLIERS: [1, 1.2, 1.45, 1.75],
  PLANE_COMMS_COMMAND_COOLDOWN_MULTIPLIERS: [1, 1.5, 2, 3],
  PLANE_LIFE_SUPPORT_SHAKE_MULTIPLIERS: [1, 1.5, 2, 3],

  PATTERN_INITIAL_DELAY_SECONDS: 1.1,
  PATTERN_BASE_INTERVAL_SECONDS: 1.85,
  PATTERN_MIN_INTERVAL_SECONDS: 1.55,
  PATTERN_DIFFICULTY_SPEEDUP_SECONDS: 0.12,
  PATTERN_DIFFICULTY_TIER_SECONDS: 35,
  PATTERN_MAX_DIFFICULTY: 2,

  PATTERN_NO_SPAWN_RADIUS: 160,
  PATTERN_NEEDLE_SPEED: 198,
  PATTERN_HEAVY_SPEED: 86,
  PATTERN_RADIAL_SPEED: 126,
  PATTERN_RAKE_SPEED: 112,

  PATTERN_RADIAL_COUNT_BASE: 16,
  PATTERN_RADIAL_COUNT_PER_DIFFICULTY: 2,

  PATTERN_SWEEP_OPENING_MARGIN: 74,

  BOARD_SHORT_FLASH_SECONDS: 0.65,
} as const;
