# PLANE SYSTEMS — Implementation Plan (for Codex)

**Target:** Replace the DOM HUD + danger meter with a full-screen Phaser game that tracks a plane with 6 damageable parts. Round loss condition changes from "danger meter fills" to "all parts destroyed." Each damaged part degrades a specific gameplay variable.

**Owner:** Codex (gameplay / core player-facing experience), with core Twitch command adapter retained.

**Status:** Implemented in the playable prototype on 2026-10-28. Remaining work is hands-on balance/stream-scale QA and live Twitch verification; this is not a vertical slice.

---

## 1. What changes

| Today | After |
|---|---|
| DOM HUD (danger meter, mission labels, board chips, command dock) around a centered 1240×760 canvas | Phaser canvas fills the browser window; **zero DOM text/HUD elements** except the connect dialog and demo command input (those stay as DOM because they're auth/input surfaces, not gameplay) |
| Round lost when `danger >= 100` | Round lost when **all 6 plane parts are Destroyed** |
| Single `danger` number | Per-part damage states: Operational → Damaged → Critical → Destroyed |
| Hit adds flat danger | Hit picks a random part and escalates its damage state |
| No part-specific gameplay effect | Each part, when damaged/critical/destroyed, changes a specific gameplay variable |

---

## 2. Plane parts — proposed defaults (Codex tunes)

Six parts. Names and effects are suggestions; feel free to swap themes or effect targets, but keep the count at 6 and the damage-state machine identical.

| Part | Damaged effect | Critical effect | Destroyed effect |
|---|---|---|---|
| **Engine** | Ship speed × 0.85 | Ship speed × 0.7 | Ship speed × 0.5 |
| **Hull** | Hit invulnerability 1.15s → 0.9s | Hit invulnerability → 0.6s | Hit invulnerability → 0.3s |
| **Avionics** | Turn responsiveness × 0.8 | Turn responsiveness × 0.6 | Turn responsiveness × 0.4 |
| **Fuel** | Danmaku cadence × 1.2 | Danmaku cadence × 1.45 | Danmaku cadence × 1.75 |
| **Comms** | Chat command cooldown × 1.5 | Chat command cooldown × 2.0 | Chat command cooldown × 3.0 |
| **Life Support** | Screen shake magnitude × 1.5 | Screen shake magnitude × 2.0 | Screen shake magnitude × 3.0 + vision vignette |

Effects are multiplicative on top of existing values in `multiGame.ts` / `GameScene.ts` and recomputed as the part state changes. Fuel affects attack cadence because the danger meter was removed with the previous HUD.

---

## 3. Damage state machine

Each part has a level: `0 = Operational, 1 = Damaged, 2 = Critical, 3 = Destroyed`.

On pilot impact (bullet hits ship):
1. Pick a part uniformly at random from the 6.
2. If part level < 3: increment by 1.
3. If part level == 3: nothing escalates further (already destroyed).
4. Recompute part-derived gameplay variables (speed, drain, cooldown, etc.).
5. Emit an event so the in-canvas UI can show which part was hit and its new state (e.g. `PART_HIT: { partId, newLevel }`).

**Repair (how a part gets better):**
- A solved routing board awards one repair reserve (maximum three per run).
- A viewer spends one reserve with `!repair <part>` (for example, `!repair engine`). Repair decrements one state (Damaged → Operational, Critical → Damaged, Destroyed → Critical).
- **Key rule from user:** "if that part gets fixed, then it doesn't get worse" — meaning a fixed part cannot be re-damaged by the *same* hit event; normal random selection still applies on future hits.
- Repair is available to chat and local demo input, uses the same per-viewer cooldown as wire commands, and is applied through the shared bounded input queue.

**Loss condition:**
- All 6 parts at level 3 (Destroyed) → phase = 'lost'.
- Keep win condition: all boards powered + ship reaches exit (unchanged).

---

## 4. New interfaces / contracts

Codex adds to `multiGame.ts` (pure TS, testable headless):

```ts
type PartId = 'engine' | 'hull' | 'avionics' | 'fuel' | 'comms' | 'life_support';
type PartLevel = 0 | 1 | 2 | 3;

interface PlanePart {
  id: PartId;
  level: PartLevel;
}

interface PlaneState {
  parts: Map<PartId, PlanePart>;
  destroyedCount: number;
}

interface PartHitEvent {
  partId: PartId;
  previousLevel: PartLevel;
  newLevel: PartLevel;
}

interface PartRepairedEvent {
  partId: PartId;
  previousLevel: PartLevel;
  newLevel: PartLevel;
}

// Adds to GameState:
// plane: PlaneState

export function damageRandomPart(state: GameState): PartHitEvent | null;
export function repairPart(state: GameState, partId: PartId): PartRepairedEvent | null;
export function computePlaneMultipliers(state: GameState): {
  speedMult: number;
  invulnSeconds: number;
  turnMult: number;
  attackRateMult: number;
  commandCooldownMult: number;
  shakeMult: number;
};
export function isPlaneDestroyed(state: GameState): boolean;
```

`GameScene.ts`:
- Subscribes to `partHit` / `partRepaired` events and draws them inside the canvas (part status grid, damage flash on the part icon).
- Reads `computePlaneMultipliers` each frame and applies to ship speed, turn rate, danmaku cadence, command cooldown, and shake.

**Rule:** If either of us changes these signatures, update both sides and this plan.

---

## 4b. Animation Spec for Part UI (emil-design-eng / apple-design)

| Event | Animation | Duration | Easing | Reduced-Motion |
|---|---|---|---|---|
| Part hit (flash) | Scale 1.0 → 1.15 → 1.0 + cyan pulse | 120ms | ease-out | Instant state swap, no flash |
| Part level change | Cross-fade old→new icon + ring color shift | 200ms | ease-out | Instant swap |
| Part repair | Green flash + ring color shift | 180ms | ease-out | Instant swap |
| Part destroyed | Red pulse + icon dim + vignette expand | 300ms | ease-out | Instant dim |

Rules:
- All part UI uses `transform` + `opacity` only (GPU)
- No layout-triggering animations (width/height/margin)
- Phaser tweens, not CSS, for canvas objects
- Prefers-reduced-motion: all above disabled, instant state changes

---

## 4c. Part State Color Palette (taste / impeccable)

| State | Fill | Ring | Text/Icon | Meaning |
|---|---|---|---|---|
| Operational | #0d1a1c | #6ef0d6 | #c9fff4 | Healthy |
| Damaged | #1a1408 | #f3c575 | #f3c575 | Caution |
| Critical | #1a0808 | #ff5f52 | #ff5f52 | Danger |
| Destroyed | #0a0505 | #332222 | #553333 | Lost |

All 6 parts use same palette — coherence over variety.

---

## 5. Full-screen UI migration (inside Phaser)

Codex owns `GameScene.ts` render. Supporting engineer owns CSS removal and config wiring.

1. **`index.html` / `src/style.css`:** Remove all gameplay DOM HUD (danger meter, board overview, command dock, event strip, footer, briefing). Keep only:
   - The `<canvas>` container (full bleed).
   - The connect dialog (DOM, for Twitch OAuth).
   - The demo command input (DOM, local testing).
   - Canvas sized to `window.innerWidth × window.innerHeight`, Phaser scale `Phaser.Scale.RESIZE` or manual resize listener.
2. **`GameScene.ts`:** Draw part status grid inside the canvas (6 part icons with damage rings/colors), damage flash on hit, win/loss overlay drawn in Phaser (not DOM round-overlay).
3. **`src/main.ts`:** Remove DOM HUD wiring (`dangerValue`, `boardList`, `event-feed`, etc.). Keep Twitch adapter + demo input wiring. Wire `onEvent`/`onState` to Phaser text objects or a minimal Phaser UI layer.
4. **`src/core/config.ts`:** Add plane part defaults (part names, damage escalation cooldown if any, repair command cost, base multipliers).

**Implementation:** Phaser `Scale.RESIZE` fills the window; a 1600 × 900 logical world is camera-fit and centered for the current wide-screen presentation.

---

## 6. Milestones (Codex leads, supporting engineer in parentheses)

**M1 — Plane state machine in `multiGame.ts` — implemented**
- Add `PlaneState`, `damageRandomPart`, `repairPart`, `computePlaneMultipliers`, `isPlaneDestroyed`.
- Unit tests by supporting engineer (vitest): random part selection, escalation chain 0→1→2→3, repair decrements, all-destroyed detection.

**M2 — Wire damage into round loop — implemented**
- On pilot hit or live-wire short, call `damageRandomPart`.
- Loss condition: all six parts destroyed → phase = 'lost'.
- Remove the danger meter; Fuel damage increases attack cadence.

**M3 — Part effects applied each frame — implemented**
- Apply `computePlaneMultipliers` to ship speed, turn, danmaku cadence, command cooldown, and shake.

**M4 — In-canvas part UI — implemented**
- Draw 6 part status icons inside the game canvas with color by damage level.
- Flash the hit part on impact; show repaired state change.

**M4 Acceptance Criteria (impeccable / taste / emil-design-eng / apple-design):**
- Part grid readable at 720p stream size (test in OBS / browser zoom).
- `impeccable critique` passes on part grid (layout, color, hierarchy, visual hierarchy).
- Animation spec from 4b implemented: hit flash 120ms ease-out, level change 200ms ease-out, repair 180ms ease-out, destroyed 300ms ease-out, all `transform` + `opacity` only.
- Color palette from 4c applied exactly; all 6 parts share same 4-state palette.
- `prefers-reduced-motion` verified: instant state swaps, no flashes, no pulses.
- Part hit flash telegraphs the hit part unambiguously (spatial consistency, apple-design P7).
- Part state transition is interruptible (hit during repair cancels cleanly, apple-design P3).
- `impeccable harden` edge cases pass: hit on already-destroyed part, rapid repair/redamage, window resize, rapid sequential hits.

**M5 — Full-screen + DOM removal — implemented**
- Canvas fills window; remove gameplay DOM HUD; keep connect dialog + demo input.
- Resize handler for window changes.

**M6 — Balance pass — pending playthroughs**
- Tune part effects, damage frequency, and repair cost after Standard and AND-gate runs are played at stream size.

---

## 7. Supporting engineer work (available to Codex)

- **vitest tests** for `damageRandomPart`, `repairPart`, `isPlaneDestroyed`, `computePlaneMultipliers`.
- **Config entries** in `src/core/config.ts` for part multipliers and repair rules.
- **Remove DOM HUD** from `index.html`/`src/style.css` once Codex confirms in-canvas replacements.
- **Headless adapter** so plane damage can be tested without Phaser.
- **Assets:** part icons / damage rings if Codex wants sprites instead of Phaser graphics.

---

## 9. Implemented MVP decisions and verification

- Gameplay is rendered in a full-window Phaser canvas using a 1600 × 900 logical layout and `Scale.RESIZE`; contents fit and center to the viewport. Only the Twitch authorization dialog and local command entry remain in the DOM.
- Six aircraft systems have four states, colored status cards, hit/repair feedback, and reduced-motion support. Destruction of all six is the only system-damage loss condition.
- Engine, Hull, Avionics, Fuel, Comms, and Life Support respectively affect speed, hit invulnerability, steering response, projectile cadence, chat command cooldown, and hit shake. Destroyed Life Support also adds a red edge vignette.
- Pilot hits and live-wire shorts damage a random part. A hit can also add a routing board according to existing cooldown/capacity rules. All boards online plus reaching the exit still wins.
- Each board can award at most one reserve on its first solve; the run holds at most three. Both `!bN wire ...` and `!repair <part>` enter the same ordered gameplay queue from Twitch or demo input.
- The previous Fuel danger-drain proposal is superseded: no danger meter remains, and Fuel damage increases danmaku cadence.
- Verification on 2026-10-28: production build passes; browser visual review confirms first-load mission selection and the full-screen HUD. The Impeccable automated detector could not run because its engine download was unavailable in this network-restricted environment. Live Twitch auth/chat has not been verified in this turn.

## 10. Remaining QA

- Play one complete Standard and one AND-gate run; verify repairs, wire replacement shorts, hit-created boards, all-systems loss, and extraction.
- Review at stream scale and tune damage/repair balance; verify reduced motion and responsive resize.
- Run live Twitch auth and command smoke when the app Client ID/channel are configured. Do not add the vertical-slice content before this MVP is reliable.

## 11. Assumptions vs verified facts

**Verified:**
- `multiGame.ts` is pure TS and testable without Phaser/Twitch.
- `config.ts` already centralizes tuning constants; new plane constants can go there.
- Build passes (`tsc --noEmit && vite build`).

**Decisions now implemented:**
- Six parts are retained. Repair uses the dedicated `!repair <part>` command paid for by a solved board.
- The danger meter is removed; Fuel controls attack cadence.
- The canvas uses `Scale.RESIZE`, while the fixed logical layout is camera-fit into the available browser dimensions.
- Multipliers derive directly from current part state in the pure TypeScript core.

Flag anything that looks wrong early; this plan is adaptable.
