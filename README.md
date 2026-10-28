# Dead Circuit

A Phaser + TypeScript browser prototype for the Twitch × Codex hackathon. The pilot steers a damaged ship through no-warning danmaku while Twitch chat routes power across numbered circuit boards with commands like `!b1 wire B3 LEFT RIGHT`. Stabilize every active board, then fly to the exit before the aircraft systems fail.

> **Status:** Minimal stream-ready demo prototype — campaign flight desk, Standard and AND-gate routing missions, scalable boards, varied danmaku, local demo mode, and Twitch EventSub adapter. Build passes. Live Twitch authorization and chat still need a real-channel smoke session.

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

1. Choose **Start Standard Routing**. Winning it unlocks the AND-gate mission.
2. Pilot with WASD or arrow keys through the flight arena. On a phone, turn to landscape for flight.
3. Try a command in the demo box:
   ```
   !b1 wire B3 LEFT RIGHT
   ```
4. Power every active board, then fly the ship to the exit at the top of the arena. **Continue** starts the next unlocked mission as a fresh sortie; it does not restore mid-run state.

For Standard Routing, route `CORE` → `DRIVE` around randomized hull damage. For an AND Gate board, power both labeled inputs, route them into the gate, then route its output to the drive. A new placement replaces the wire already in that cell; replacing an energized wire triggers a short and damages an aircraft system. Solving a board earns a limited repair reserve.

---

## The problem

Streamers need interactions that viewers can join in seconds, without downloading anything, installing a bot, or learning a complex command vocabulary. Most Twitch extensions either passive-watch or force viewers through menus — bad for a regular audience that just wants to type something and see an immediate effect on screen.

Dead Circuit goes the other way: keep the input as simple as possible, and make every chat message change the game state visibly and immediately. The streamer has a real task (dodge bullets), chat has a real task (route power), and both roles share the same aircraft damage and extraction stakes.

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
- **DOM shell** (`index.html`, `style.css`, `main.ts`) owns the accessible flight desk, campaign dialogs and settings, Twitch connection, demo input, and transient command feedback.

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

Two distinct full directions map to one of six wire tiles (`H`, `V`, `NE`, `ES`, `SW`, `WN`). Latest placement wins in a cell. Replacing an energized wire triggers a short penalty and part damage, but the new orientation still takes effect and power is recalculated immediately. This keeps the command unambiguous without abbreviations, and each placement visibly changes the board.

### Count active chatters, not viewers

Board capacity scales from unique Twitch `chatter_user_id` values in a rolling two-minute window, roughly one board per 100 unique active chatters (hard cap 100). Lurkers are intentionally invisible — the game measures people who participate, not audience size. Capacity never shrinks mid-run, so a quiet stretch never removes a board chatters are already working on.

### Every board is independent

Each board has its own ID, seed, grid, and solved state. The streamer selects which board page is shown on screen, but viewers can target any active board with its `!bN` prefix. Extraction requires every board created during the run to be powered, so chat must coordinate across boards, not just camp on B1.

### No warning labels on danmaku

Four original pattern families arrive without pre-attack telegraphs: fast needles, slow heavy rounds, radial spokes, and edge rakes with a deliberate gap. Every emission stays at least 160 logical pixels from the pilot; aimed needles retain at least 0.7 seconds of travel time. The pilot threads gaps; chat routes power; the round ends in minutes.

### Campaign and settings

One campaign profile is saved locally in the browser. Standard victory unlocks the existing AND-gate mission. **Continue** starts the earliest unlocked incomplete mission as a fresh sortie; once both missions are complete, it opens replay selection. **New Save** asks before resetting campaign progress and leaves display settings intact. Fullscreen, interface scale, reduced motion, and screen shake are stored separately. Twitch tokens are not written to browser storage. Saves remain local to this browser origin and are not synced.

---

## Repo structure

```
.
├── index.html                    DOM shell + HUD
├── src/style.css                 Stream-size layout and theming
├── src/main.ts                   Twitch + scene + HUD wiring
├── src/core/config.ts            Tuning constants (damage, speed, patterns, scaling)
├── src/core/game.ts              Level definitions, tile kinds, board templates
├── src/core/multiGame.ts         Game state, rules, power tracing, seeded maps, danmaku
├── src/core/campaign.ts          Campaign progression and versioned local save decoding
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

Built with `npm run dev` (Vite, port 5173) or `npm run build` (type-check + static bundle to `dist/`). Phaser draws a 1600×900 logical flight scene and fits it to the browser; portrait phones show a rotate-to-landscape prompt during flight.

---

## Known limitations

- **Live Twitch unverified.** OAuth + EventSub adapter is implemented but not yet smoke-tested on a real channel. Demo mode works without Twitch.
- **Local saves only.** One campaign profile and display preferences are stored per browser origin; there is no cloud sync, account, or cross-browser transfer.
- **Two board templates only.** Standard routing and AND-gate logic; OR/XOR and additional gate types are out of scope for this slice.
- **No custom art or audio.** Everything is Phaser Graphics primitives; real sprites/sound are planned polish.
- **Small evaluation surface.** Generated board candidates are validated with the live power rules, and seed determinism/fair projectile spacing have been sampled locally. Stream-scale balance and live audience pacing still need real-channel play.
- **Chunk size warning.** The Vite bundle exceeds 500 KB minified (mostly Phaser). Acceptable for a prototype; code-splitting the Twitch adapter is a follow-up.
- **`.env.local` never committed.** Set `VITE_TWITCH_CLIENT_ID` locally if you want to skip entering the Client ID each time; never commit a Twitch client secret.

---

## Status

**Done**
- Phaser 4 + TypeScript + Vite; production build passes
- Standard and AND-gate board templates playable locally
- Replaceable wires, short penalty, power recalculation on every placement
- Scalable multi-board via unique active chatters (~100 per board, cap 100)
- Seeded randomized Standard and gate layouts; every displayed candidate validated with `calculatePower`
- Four varied no-warning projectile patterns with ship-relative safe emission distance
- Campaign flight desk, Continue/New Save flow, Standard-to-AND unlock, mission replay
- Fullscreen, interface scale, reduced motion, and screen shake settings
- Ship collision core, hit invulnerability, six-part damage/repair, win/loss rounds
- Twitch EventSub adapter with OAuth, reconnect, deduplication, per-viewer pacing
- Local demo mode + scaling simulation (+100 / +1,000 / +10,000 chatters, simulate hit)
- `COLLABORATION_PLAN.md` for Codex + supporting engineer collaboration

**Next**
- Live Twitch smoke session on a real channel and HTTPS hosting
- Stream-scale playthroughs to tune pattern density, readability, and board growth
- Code-split Phaser or the Twitch adapter to shrink the prototype bundle
- Add automated core-rule tests when a test runner is selected

---

## Documents

| File | Contents |
|---|---|
| [COLLABORATION_PLAN.md](COLLABORATION_PLAN.md) | Shared plan for Codex (gameplay) + supporting engineer (tests, refactor, build, polish) |
| [GDD.md](GDD.md) | Game design document: pillars, mechanics, narrative, visual/audio direction, timeline |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase-by-phase implementation history and research log |

---

**Built for the Twitch × Codex hackathon.** Streamer pilots, chat engineers, everyone shares the same circuit.

