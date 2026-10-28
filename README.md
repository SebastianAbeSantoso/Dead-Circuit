# Dead Circuit

A Phaser + TypeScript browser prototype for the Twitch × Codex hackathon. The streamer pilots a ship through no-warning danmaku patterns while Twitch chat routes power across numbered circuit boards with commands like `!b1 wire B3 LEFT RIGHT`. Route every board, then reach the exit before the danger meter fills.

> **Status:** Playable vertical slice — Standard and AND-gate board templates, scalable multi-board via unique active chatters, local demo mode without Twitch, Twitch EventSub adapter. Build passes. Live Twitch smoke session pending.

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Phaser](https://img.shields.io/badge/phaser-4.2.0-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.9-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

1. Pick **Standard Boards** or **AND Gate Boards**.
2. Pilot with WASD or arrow keys through the flight arena.
3. Try a command in the demo box:
   ```
   !b1 wire B3 LEFT RIGHT
   ```
4. Power every active board, then fly the ship to the exit at the top of the arena.

For Standard Routing, route `CORE` → `DRIVE` around randomized hull damage. For an AND Gate board, power both labeled inputs, route them into the gate, then route its output to the drive. A new placement replaces the wire already in that cell; replacing an energized wire triggers a short penalty and raises danger.

---

## The problem

Streamers need interactions that viewers can join in seconds, without downloading anything, installing a bot, or learning a complex command vocabulary. Most Twitch extensions either passive-watch or force viewers through menus — bad for a regular audience that just wants to type something and see an immediate effect on screen.

Dead Circuit goes the other way: keep the input as simple as possible, and make every chat message change the game state visibly and immediately. The streamer has a real task (dodge bullets), chat has a real task (route power), and both roles share the same stakes (the danger meter).

---

## Why this generalizes

The Twitch-integrated puzzle is the demonstration, not the contribution. Nothing in `src/core/multiGame.ts` names Twitch — game rules, board generation, power tracing, and round win/loss are pure TypeScript, independent of Phaser rendering and the Twitch adapter. The same core serves local demo input, Twitch chat commands, and future input sources (overlay, mobile companion, etc.).

Any task where the output is a bounded command applied to shared state fits the same pipeline: collaborative drawing, shared inventory management, group rhythm games, or a different trade. What the prototype establishes is that a small, deterministic game core plus a thin input adapter makes a Twitch-integrated game testable without a live audience.

---

## Architecture

```
Keyboard / Demo input  ─┐
Twitch EventSub adapter ─┼─> normalized command  ─> game core (multiGame.ts)  ─> Phaser scene (render)
                          (ParsedWireCommand)    (pure TS, testable headless)  (GameScene.ts)
```

- **Input adapters** translate keyboard and Twitch chat into the same command shape (`ParsedWireCommand`).
- **Game core** owns state, rules, power tracing, map generation, and projectile patterns. It does not import Phaser or Twitch.
- **Render/UI** draws the board, ship, bullets, and HUD; reads state via `onEvent` / `onState` callbacks.
- **DOM shell** (`index.html`, `style.css`, `main.ts`) wires Twitch connection, board selection, demo input, and crew feed together.

---

## Design decisions

### One command grammar, two roles

```
!b1 wire B3 LEFT RIGHT
│   │   │   └─── second port (UP/DOWN/LEFT/RIGHT)
│   │   └─────── first port
│   └─────────── cell coordinate (column A-G, row 1-5)
└─────────────── board ID (B1, B2, …)
```

Two distinct full directions map to one of six wire tiles (`H`, `V`, `NE`, `ES`, `SW`, `WN`). Latest placement wins in a cell. Replacing an energized wire triggers a bounded short penalty — visible flash, danger increase — but the new orientation still takes effect and power is recalculated immediately. This keeps the command unambiguous without abbreviations, and every accepted command produces an on-screen change viewers can read at stream size.

### Count active chatters, not viewers

Board capacity scales from unique Twitch `chatter_user_id` values in a rolling two-minute window, roughly one board per 100 unique active chatters (hard cap 100). Lurkers are intentionally invisible — the game measures people who participate, not audience size. Capacity never shrinks mid-run, so a quiet stretch never removes a board chatters are already working on.

### Every board is independent

Each board has its own ID, seed, grid, and solved state. The streamer selects which board page is shown on screen, but viewers can target any active board with its `!bN` prefix. Extraction requires every board created during the run to be powered, so chat must coordinate across boards, not just camp on B1.

### No warning labels on danmaku

Bullet patterns arrive from all four arena edges without pre-attack telegraphs. Fairness comes from slow readable projectiles, distinctive colors and shapes, persistent escape gaps, and a small visibly-marked ship collision core with brief invulnerability after a hit. The pilot threads gaps; chat routes power; the round ends in minutes.

---

## Repo structure

```
.
├── index.html                    DOM shell + HUD
├── src/style.css                 Stream-size layout and theming
├── src/main.ts                   Twitch + scene + HUD wiring
├── src/core/config.ts            Tuning constants (danger, speed, patterns, scaling)
├── src/core/game.ts              Level definitions, tile kinds, board templates
├── src/core/multiGame.ts         Game state, rules, power tracing, map gen, danmaku
├── src/game/GameScene.ts         Phaser scene: drawing, ship input, board selection
├── src/twitch/TwitchChat.ts      OAuth, EventSub WebSocket, command parsing, demo mode
├── package.json                  Phaser 4 + Vite + TypeScript
├── tsconfig.json
├── COLLABORATION_PLAN.md         Shared plan for Codex + supporting engineer
├── GDD.md                        Game design document
├── IMPLEMENTATION_PLAN.md        Solo-dev implementation history
└── README.md
```

The AI / backend / frontend split is readable straight from the layout: game rules are touched in exactly `multiGame.ts` and `game.ts`, rendering lives in `GameScene.ts`, Twitch integration lives in `TwitchChat.ts`, and integration glue lives in `main.ts`.

---

## Interface

### Twitch / demo command

```
!b1 wire B3 LEFT RIGHT
```

| Token | Meaning | Example |
|---|---|---|
| `b1` | Board ID | `b1`, `b2`, … |
| `B3` | Cell coordinate | Column A–G, row 1–5 |
| `LEFT RIGHT` | Two distinct ports the wire connects | `UP DOWN`, `LEFT RIGHT`, `UP RIGHT`, … |

Examples:

```text
!b1 wire B3 LEFT RIGHT        # straight horizontal wire on B1, cell B3
!b1 wire C3 UP RIGHT          # corner wire on B1, cell C3
!b2 wire D4 LEFT DOWN         # wire on board B2
```

Invalid targets (fixed source/drive/hull/gate cells, wrong board, same port twice) return concise on-screen feedback. Per-viewer pacing and global deduplication prevent command floods.

### Phaser game config

Built with `npm run dev` (Vite, port 5173) or `npm run build` (type-check + static bundle to `dist/`). Canvas resolution 1240×760, `FIT` scale mode, centered.

---

## Known limitations

- **Live Twitch unverified.** OAuth + EventSub adapter is implemented but not yet smoke-tested on a real channel. Demo mode works without Twitch.
- **No persistent progression.** Runs are in-memory only; no accounts, leaderboards, or save state.
- **Two board templates only.** Standard routing and AND-gate logic; OR/XOR and additional gate types are out of scope for this slice.
- **No custom art or audio.** Everything is Phaser Graphics primitives; real sprites/sound are planned polish.
- **Small eval surface.** Board seeds are validated for solvability at generation time, but balance (danger rates, pattern density, board count vs. chat size) is tuned by local simulation, not live play.
- **Chunk size warning.** The Vite bundle exceeds 500 KB minified (mostly Phaser). Acceptable for a prototype; code-splitting the Twitch adapter is a follow-up.
- **`.env.local` never committed.** Set `VITE_TWITCH_CLIENT_ID` locally if you want to skip entering the Client ID each time; never commit a Twitch client secret.

---

## Status

**Done**
- Phaser 4 + TypeScript + Vite stack; `npm run build` passes clean
- Standard and AND-gate board templates playable locally
- Replaceable wires, short penalty, power recalculation on every placement
- Scalable multi-board via unique active chatters (~100 per board, cap 100)
- Seeded map generation; every generated board validated solvable
- Danmaku flight arena: aimed fans, radial rings, edge sweeps from all sides
- Ship collision core, hit invulnerability, danger meter, win/loss rounds
- Twitch EventSub adapter with OAuth, reconnect, deduplication, per-viewer pacing
- Local demo mode + scaling simulation (+100 / +1,000 / +10,000 chatters, simulate hit)
- `COLLABORATION_PLAN.md` for Codex + supporting engineer collaboration

**Next**
- Live Twitch smoke session on a real channel
- Unit tests for power tracing, `placeWire`, level solvability
- Code-split Twitch adapter to shrink the demo bundle
- Polish: screen shake on hit, power-flow animation, exit pulse

---

## Documents

| File | Contents |
|---|---|
| [COLLABORATION_PLAN.md](COLLABORATION_PLAN.md) | Shared plan for Codex (gameplay) + supporting engineer (tests, refactor, build, polish) |
| [GDD.md](GDD.md) | Game design document: pillars, mechanics, narrative, visual/audio direction, timeline |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase-by-phase implementation history and research log |

---

**Built for the Twitch × Codex hackathon.** Streamer pilots, chat engineers, everyone shares the same circuit.

