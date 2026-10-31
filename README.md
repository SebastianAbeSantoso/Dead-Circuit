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

### Campaign and settings

One campaign profile is saved locally in the browser. Standard victory unlocks the existing AND-gate mission. **Continue** starts the earliest unlocked incomplete mission as a fresh sortie; once both missions are complete, it opens replay selection. **New Save** asks before resetting campaign progress and leaves display settings intact. Fullscreen, interface scale, reduced motion, and screen shake are stored separately. Twitch tokens are not written to browser storage. Saves remain local to this browser origin and are not synced.

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

## Documents

| File | Contents |
|---|---|
| [COLLABORATION_PLAN.md](COLLABORATION_PLAN.md) | Shared plan for Codex (gameplay) + supporting engineer (tests, refactor, build, polish) |
| [GDD.md](GDD.md) | Game design document: pillars, mechanics, narrative, visual/audio direction, timeline |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase-by-phase implementation history and research log |

---

**Built for the Twitch × Codex hackathon.** Streamer pilots, chat engineers, everyone shares the same circuit.

