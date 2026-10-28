# PLANE SYSTEMS — Implementation Plan (for Codex)

**Target:** Replace the DOM HUD + danger meter with a full-screen Phaser game that tracks a plane with 6 damageable parts. Round loss condition changes from "danger meter fills" to "all parts destroyed." Each damaged part degrades a specific gameplay variable.

**Owner:** Codex (gameplay / core player-facing experience). Supporting engineer owns tests, config, integration glue, and assets.

**Status:** Proposed design — assumptions marked, not locked. Codex tunes values and picks final part effects.

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
| **Fuel** | Danger drain × 1.25 | Danger drain × 1.5 | Danger drain × 2.0 |
| **Comms** | Chat command cooldown × 1.5 | Chat command cooldown × 2.0 | Chat command cooldown × 3.0 |
| **Life Support** | Screen shake magnitude × 1.5 | Screen shake magnitude × 2.0 | Screen shake magnitude × 3.0 + vision vignette |

**Assumption:** Effects are multiplicative on top of existing values in `multiGame.ts`/`GameScene.ts` and recomputed whenever a part's state changes. Codex decides exact numbers.

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
- Chat wires power to a part via existing `!bN wire` command targeting a "repair node" on that part's board, OR a dedicated repair command Codex adds.
- Repairing decrements the part level by 1 (Damaged → Operational, Critical → Damaged, Destroyed → Critical).
- **Key rule from user:** "if that part gets fixed, then it doesn't get worse" — meaning a fixed part cannot be re-damaged by the *same* hit event; normal random selection still applies on future hits.
- Repair should require chat coordination (consistent with the game's pillars).

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
  dangerDrainMult: number;
  commandCooldownMult: number;
  shakeMult: number;
};
export function isPlaneDestroyed(state: GameState): boolean;
```

`GameScene.ts`:
- Subscribes to `partHit` / `partRepaired` events and draws them inside the canvas (part status grid, damage flash on the part icon).
- Reads `computePlaneMultipliers` each frame and applies to ship speed, turn rate, danger drain, command cooldown, shake.

**Rule:** If either of us changes these signatures, update both sides and this plan.

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

**Assumption:** Full-screen means `window.innerWidth × window.innerHeight` with the canvas resizing on window resize; Phaser `Scale.RESIZE` mode. Codex confirms the exact scale mode.

---

## 6. Milestones (Codex leads, supporting engineer in parentheses)

**M1 — Plane state machine in `multiGame.ts`** (Codex)
- Add `PlaneState`, `damageRandomPart`, `repairPart`, `computePlaneMultipliers`, `isPlaneDestroyed`.
- Unit tests by supporting engineer (vitest): random part selection, escalation chain 0→1→2→3, repair decrements, all-destroyed detection.

**M2 — Wire damage into round loop** (Codex)
- On pilot hit, call `damageRandomPart` instead of (or in addition to) flat danger.
- Loss condition: `isPlaneDestroyed(state)` → phase = 'lost'.
- Keep danger meter as a secondary pressure source or remove entirely (Codex decides).

**M3 — Part effects applied each frame** (Codex)
- Apply `computePlaneMultipliers` to ship speed, turn, danger drain, command cooldown, shake.

**M4 — In-canvas part UI** (Codex)
- Draw 6 part status icons inside the game canvas with color by damage level.
- Flash the hit part on impact; show repaired state change.

**M5 — Full-screen + DOM removal** (Codex + supporting engineer)
- Canvas fills window; remove gameplay DOM HUD; keep connect dialog + demo input.
- Resize handler for window changes.

**M6 — Balance pass** (Codex, with supporting engineer config exposure)
- Tune part effects, damage frequency, repair cost so a round is winnable but tense.

---

## 7. Supporting engineer work (available to Codex)

- **vitest tests** for `damageRandomPart`, `repairPart`, `isPlaneDestroyed`, `computePlaneMultipliers`.
- **Config entries** in `src/core/config.ts` for part multipliers and repair rules.
- **Remove DOM HUD** from `index.html`/`src/style.css` once Codex confirms in-canvas replacements.
- **Headless adapter** so plane damage can be tested without Phaser.
- **Assets:** part icons / damage rings if Codex wants sprites instead of Phaser graphics.

---

## 8. Assumptions vs verified facts

**Verified:**
- `multiGame.ts` is pure TS and testable without Phaser/Twitch.
- `config.ts` already centralizes tuning constants; new plane constants can go there.
- Build passes (`tsc --noEmit && vite build`).

**Assumptions (Codex to confirm or correct):**
- 6 parts is the right count; user said "like six parts."
- Repair happens through chat wire commands (keeps the "chat routes power" pillar) rather than a separate pilot button.
- Danger meter can be removed or kept as a background pressure; Codex decides.
- Full-screen canvas with `Scale.RESIZE` is acceptable.
- Part effects are multiplicative and recomputed on state change.

Flag anything that looks wrong early; this plan is adaptable.
