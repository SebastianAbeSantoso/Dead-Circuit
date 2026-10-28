# DEAD CIRCUIT — Collaboration Plan

Shared working document for Codex (primary gameplay implementation) and the supporting engineer. Adaptable, not a contract. Update it when the design evolves.

## 1. Project snapshot (verified facts)

- **Stack:** Phaser 4 (`^4.2.0`) + TypeScript 5 (`^5.9.0`) + Vite 7 (`^7.1.0`), npm, ES modules. `npm run build` (`tsc --noEmit && vite build`) passes.
- **Game core (framework-independent):** `src/core/multiGame.ts` (542 lines) holds state, rules, power tracing, map generation, projectile patterns, and round win/loss. `src/core/game.ts` holds level definitions, tile kinds, board size, and the two board templates (standard, AND-gate logic).
- **Render:** `src/game/GameScene.ts` (Phaser scene) — drawing, ship input, board selection, delegates game-step to `multiGame`.
- **Twitch:** `src/twitch/TwitchChat.ts` — OAuth, EventSub WebSocket lifecycle/keepalive/reconnect, command deduplication and pacing, demo mode fallback.
- **DOM glue:** `src/main.ts` wires Twitch + scene + HUD; `index.html` + `src/style.css` provide the shell/HUD.
- **Docs:** `GDD.md` (design), `IMPLEMENTATION_PLAN.md` (solo-dev history), `README.md` (how to run).
- **Content:** 7×5 boards, scalable multi-board via unique active chatters (~100 per board, hard cap 100), danmaku flight arena (570×570), Standard and AND-gate templates, seeded map generation, local demo mode without Twitch.
- **Tuning:** `src/core/config.ts` centralizes gameplay and scaling constants.

## 2. Division of responsibilities (examples, not restrictive)

**Codex — primary gameplay / core player-facing experience:**
- Board templates, wire-placement rules, connectivity/power logic (core gameplay)
- Ship movement, bullet patterns, round win/loss, danger meter
- Twitch command flow into the game, command grammar/UX
- HUD/game-feel choices Codex makes for the player-facing experience

**Supporting engineer — engineering that makes the project stronger:**
- Unit + integration tests for the pure game core
- Code review, refactoring, code splitting, shared utilities
- Config/tuning constants (balance knobs in one place)
- Asset creation & organization (sprites, audio)
- Build tooling (code-splitting, chunk size, dev workflow)
- Integration glue (headless adapter, mock Twitch for testing)
- Debugging, polish engineering (screen shake, power-flow animation), performance

These are a menu, not a checklist. Use judgment; communicate on overlaps instead of avoiding them.

## 3. Architecture (current, lightweight)

```
Keyboard / Demo input  ─┐
Twitch EventSub adapter ─┼─> normalized command  ─> game core (multiGame.ts)  ─> Phaser scene (render)
                          (ParsedWireCommand)    (pure TS, testable)         (GameScene.ts)
```

- Game core is independent of Phaser and Twitch so it can be tested headless.
- `GameScene` owns the Phaser update loop and calls into `multiGame` rules.
- Twitch adapter translates chat messages into the same command shape as demo input; the Phaser scene queues inputs and applies them at the start of a frame.
- DOM HUD reads state via `onEvent` / `onState` callbacks.

## 4. Key interfaces / contracts (coordinate before changing)

From `multiGame.ts`:
- `GameState`, `CircuitBoard`, `ParsedWireCommand`
- `createInitialState(levelId, seed)`, `beginRound(state)`, `updateRound(state, dt, movement)`, `placeWire(state, command)`, `parseWireCommand(input, owner)`, `simulatePilotHit(state)`, `noteActiveChatter(state, id)`
- Constants: `CHATTER_WINDOW_MS`, `CHATTERS_PER_BOARD`, `MAX_BOARDS_PER_RUN`, `BOARD_SPAWN_INTERVAL`, `HIT_BOARD_COOLDOWN`, `FLIGHT_ARENA`

From `game.ts`:
- `LEVELS`, `BOARD_SIZE`, `TILE_KINDS`, `LevelDefinition`, `TileKind`, `LevelId`, `cellKey`

From `GameScene.ts` (public callbacks set by `main.ts`):
- `onEvent(message, good)`, `onState(state)`, `submitWire(raw, owner)`, `noteChatter(id)`, `simulateChatters(n)`, `simulateHit()`, `selectBoard(id)`, `startRun(levelId)`, `getDisplayedBoardId()`

From `TwitchChat.ts` (constructor callbacks):
- `onChat({username, chatterId, text})`, `onStatus(message, state)` where `state` is `disconnected | connecting | connected`, `onChatter(id)`, optional `onNotice(message)` for throttling feedback.

If either of us changes a signature above, update the other side and this plan.

## 5. Dependencies

- `phaser ^4.2.0` (runtime), `typescript ^5.9.0`, `vite ^7.1.0`, `@types/node ^24.0.0` (dev)
- Twitch OAuth Client ID provided at runtime (never commit secrets); no client secret in browser
- Test runner: not yet chosen — propose vitest (Vite-native, TS-friendly) when adding tests

## 6. Coordination areas / file ownership

| File | Primary owner | Notes |
|---|---|---|
| `src/core/multiGame.ts` | Codex (gameplay rules) | Supporting engineer may refactor/split, but must preserve function signatures Codex relies on |
| `src/core/game.ts` | Shared | Level definitions and templates — coordinate edits; both may add templates |
| `src/game/GameScene.ts` | Codex (render/feel) | Supporting engineer may add a headless/test adapter layer |
| `src/twitch/TwitchChat.ts` | Codex (Twitch integration) | Supporting engineer can add tests/mocks |
| `src/main.ts` | Shared (integration glue) | Wire changes together here |
| `index.html`, `src/style.css` | Shared | HUD/layout |

Before editing a file you don't primarily own, leave a note in this plan or a quick comment so we don't duplicate work.

## 7. Assumptions vs verified facts

**Verified:**
- Build passes; two templates playable locally; demo mode works without Twitch.
- Core rules are pure TypeScript (testable without Phaser/Twitch).

**Assumptions (treat as working hypotheses, validate as we go):**
- Codex will implement gameplay features in TypeScript within the existing structure; if a restructure of the core is wanted, we agree on it first.
- vitest (or similar) can run the pure core in Node without a browser.
- Twitch smoke testing happens after local core is stable; demo mode covers the interim.

Flag any assumption that looks wrong early.

## 8. Immediately useful work the supporting engineer can own

1. **`src/core/config.ts`** — completed: tuning constants (danger rates, spawn interval, hit cooldown, board-capacity math, bullet speeds, pattern timing) live in one editable config object imported by `multiGame.ts`.
2. **Unit tests** for `placeWire`, power tracing, `generateLevel` solvability across seeds (both templates).
3. **Split `multiGame.ts`** into `state.ts`, `power.ts`, `maps.ts`, `patterns.ts`, `round.ts` once interfaces stabilize.
4. **Asset pipeline** — organize `assets/` (sprites, audio) and Vite asset handling.
5. **Build** — code-split the Twitch adapter via dynamic `import()` to shrink the demo bundle (currently ~1.4 MB JS).
6. **Polish engineering** — screen shake on hit, power-flow animation, exit online pulse (additive, behind config flags).

Config extraction is complete. Tests and future refactoring remain available as supporting-engineer work; keep Twitch and game logic in their current ownership areas.

## 9. Active design direction — Plane Systems

See `PLANE_SYSTEMS_PLAN.md` for the full spec. Summary of the shift:

- **Full-screen Phaser canvas** (`window.innerWidth × window.innerHeight`, `Scale.RESIZE`), replacing the centered 1240×760 canvas.
- **Remove all gameplay DOM HUD** (danger meter, board overview, command dock, event strip, footer, briefing). Keep only the connect dialog and demo command input as DOM.
- **Plane damage system:** 6 parts (Engine, Hull, Avionics, Fuel, Comms, Life Support), each with states Operational → Damaged → Critical → Destroyed. Pilot hit escalates a random part; repair decrements it. All 6 Destroyed = loss. Each part state changes a gameplay multiplier (speed, turn, drain, cooldown, shake).
- Loss condition moves from `danger >= 100` to `isPlaneDestroyed(state)`.

Update `COLLABORATION_PLAN.md` sections 1, 3, 4, 6, 8 to match as Codex implements.

## 10. Staying in sync

- Update this plan when responsibilities, interfaces, or the design change.
- Prefer small, independently useful changes Codex can integrate easily.
- When a task sits on the boundary, flag it rather than assuming ownership.
- Don't block on approval for small decisions; communicate substantial overlaps or interface changes.

