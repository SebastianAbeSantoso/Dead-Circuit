# DEAD CIRCUIT — Minimal Demo Implementation Plan

**Goal:** Deliver a small, linkable browser demo that proves the main interaction: the streamer pilots a ship while Twitch chat places circuit tiles, with visible power, failure, and round outcomes. This is a prototype demo, not the later vertical slice.

**Starting point:** The workspace contains the GDD and this plan, but no application source. **Decision: use Phaser + TypeScript** for the browser prototype, with Vite as the build/dev server. Phaser’s official project guidance supports TypeScript templates and Phaser 4 is the current open-source 2D framework line. Revisit only if a concrete setup or team-familiarity issue blocks progress.

**Current status:** The local Phaser prototype now includes Standard and AND-gate boards, replaceable wires, scalable numbered boards, four fairer danmaku families, seeded validated layouts, a campaign flight desk with local saves/settings, six-part aircraft damage/repair, and the Twitch adapter. `npm run build` passes. Stream-scale balance and live Twitch authorization/chat still need a smoke session; public hosting is not configured yet.
**Validation note (2026-10-28):** `npm run build` passes (TypeScript check plus Vite production bundle). Browser review confirms the initial mission picker and full-screen HUD render. Vite reports a large Phaser bundle (~1.44 MB minified, ~389 KB gzip); acceptable for this prototype, but worth revisiting before public hosting.

## Demo scope

### In scope

- Two reusable board templates on compact grids: standard routing (one source to one destination) and logic-gate routing (two inputs through an AND gate to one destination). A run can contain multiple numbered instances of its chosen template; show one selected board at a time beside a near-square danmaku flight arena.
- Latest-write wire placement: a new wire command replaces the previous wire in its cell and immediately recalculates power. Fixed source, destination, hull, and gate cells remain protected. Replacing an energized wire still triggers the bounded short penalty, while the replacement takes effect.
- Pilot movement with a small keyboard control set.
- Viewer placements that visibly alter the grid; power connectivity updates immediately.
- One legible short-circuit penalty and the six-part aircraft damage system. (The initial danger meter was superseded by Plane Systems.)
- A start screen, connection status, short command instructions, round result, and restart.
- Local/demo input plus Twitch chat input through the same game command interface.
- A hosted HTTPS link suitable for opening during a Twitch stream.

### Out of scope

- More than two levels, persistent progression, upgrades, accounts, leaderboards, or persistent data.
- A broad logic-gate catalog beyond the first AND-gate level, complex physics, elaborate narrative, and custom art/audio production.
- Twitch chat output, moderation tools, overlays/extensions, multi-channel hosting, or public matchmaking.
- Any assumption that the prototype is ready for production-scale traffic.

## Proposed architecture

Use a Phaser + TypeScript browser app with a canvas playfield and ordinary DOM controls/HUD. Keep game state and rules independent from Phaser, so rendering and input can evolve without changing Twitch parsing or game rules.

```text
Keyboard / Demo controls ─┐
                         ├─> normalized game commands ─> game state + rules ─> canvas / HUD
Twitch EventSub adapter ─┘
```

- **Game core:** A deterministic state model for board, ship, timer/danger, and round phase. Rules take validated commands and elapsed time; they do not import Twitch or UI code.
- **Render/UI:** Draw the grid, connected power, ship, hazards, and effects. Keep objective, connection state, command hint, and outcome readable at stream scale.
- **Input adapters:** Local controls and Twitch chat translate into the same small command set. This keeps game behavior testable without Twitch.
- **Twitch adapter:** Browser WebSocket connection to Twitch EventSub, `channel.chat.message` subscription, parser, deduplication, rate limits, and visible connection lifecycle.
- **Board manager:** Keep board instances separate from the Phaser scene and Twitch adapter. Track active unique chatter IDs in a rolling in-memory window, calculate board capacity from that count, create boards from seeded templates, and route each board’s own state and progress to rendering.
- **Projectile/pattern model:** Keep attack timing, seeded pattern selection, projectile positions/velocities, and hit detection in the framework-independent game core. Phaser owns only visual objects. Begin with a simple bounded bullet list and circle collision; add a pooled visual Group only if profiling shows per-frame rendering/allocation costs. Avoid tying game rules to Arcade Physics for this prototype.
- **State flow:** Accept incoming events into a short command queue; process them in arrival order at a consistent game update boundary. Commands identify a board and two connected port directions (`!b1 wire B3 LEFT RIGHT`); latest wire placement wins within that board and immediately recalculates its circuit. Reject fixed/invalid cells with concise feedback. Deduplicate and pace globally across boards so board IDs cannot bypass existing limits.
- **Procedural maps:** Use a seeded random generator for repeatable layouts. A* can select a varied route under length/turn costs, but it is not the map randomizer by itself. Validate every generated board with the exact tile-port and gate logic used in play. Reject and regenerate layouts without a solution.
- **Hosting:** Static HTTPS hosting for the browser app. Twitch OAuth redirect URL must match the deployed app URL (and local development URL where configured).

### Browser implementation alternatives

The game’s core is a fixed 2D board with a moving ship and HUD. The options differ mainly in how much rendering/input/game-loop infrastructure the team wants to own:

| Option | Fit for this demo | Tradeoff |
|---|---|---|
| **JavaScript + Canvas 2D** | Fastest and smallest if the team is fluent in browser JavaScript; enough for a modest grid and simple ship animation. | We own drawing, scaling, input handling, and the frame/update loop. Canvas content is not inherently accessible, so labels and important HUD text should remain regular DOM. |
| **TypeScript + Canvas 2D** | Same lightweight 2D approach, with safer typed game commands, board state, and Twitch event parsing. | Adds a compile/build step and types do not replace runtime validation of chat input. |
| **Phaser + JavaScript or TypeScript** | Strong fit if the game benefits from a ready-made 2D scene, input, timing, and rendering framework while staying browser-first. | More framework/API to learn than a canvas-only board; use the version the team can support and avoid unnecessary plugins. Phaser’s official documentation supports both languages and Canvas/WebGL rendering. |
| **Three.js + JavaScript or TypeScript** | Appropriate if the prototype’s defining appeal depends on a 3D ship, space scene, or camera movement. | The current design is explicitly 2D; Three.js introduces scene/camera/renderer and 3D asset concepts without helping the grid rules or Twitch connection. Not the default for this demo. |

**Decision:** Use **Phaser + TypeScript** for this prototype. Keep Three.js out of scope unless the game’s art direction changes to 3D; retain the framework comparison above as design rationale rather than an unresolved choice.

**Phase 0 setup spike:** Time-box to roughly half a day. Verify Phaser + TypeScript + Vite builds, draw the grid, move a placeholder ship, and show one accepted command. Confirm stream-size readability and that the team can work in the chosen stack. Do not build the same screen in a second framework; use the existing EventSub test as a separate integration check.

### Twitch connection approach

For the first shareable demo, use Twitch’s browser-compatible EventSub WebSocket with the broadcaster’s own Twitch user authorization and `user:read:chat` scope. Use the broadcaster as both the chat reader and channel owner. This avoids a separate bot account and avoids putting a client secret in the browser. Keep the access token in memory, validate it as required, and provide a disconnect control. Re-check the current Twitch app registration and token guidance before implementation; OAuth settings and policies can change.

Twitch currently recommends EventSub and API calls for chat over IRC. EventSub WebSocket clients must handle welcome, notification, keepalive, reconnect, revocation, disconnect, and duplicate delivery. Keep this complexity contained inside the Twitch adapter. If browser-only OAuth or Twitch API constraints block the demo, pause and choose the smallest compliant backend/token flow rather than exposing a client secret.

## Phases and acceptance criteria

### 0. Design and integration spike

- Set up the Phaser + TypeScript + Vite project and confirm the team can run and edit it.
- Lock the smallest command grammar, board dimensions, tile orientations, duplicate-placement behavior, per-viewer cooldown, and round duration.
- Register a development Twitch app and verify broadcaster authorization plus one `channel.chat.message` event over EventSub WebSocket.
- Test the hosted-app OAuth redirect and the local development redirect before building around the flow.

**Exit:** The selected stack builds and runs; one real Twitch chat message can be received and displayed in a throwaway page without a client secret exposed; local input can be normalized to the same command shape.

### 1. Local playable loop

- Draw a readable board and ship using placeholder shapes.
- Add keyboard pilot movement, start/pause/restart, timer, danger meter, and round outcomes.
- Implement wire placement, connectivity, power animation/state, and a short consequence.
- Add a visible demo-command panel so the whole loop can be shown without a live channel.

**Exit:** A person unfamiliar with the project can start a run, understand the goal, place tiles, see a connection or short, and reach an outcome without Twitch.

### 1A. Two missions and replaceable wires — implemented

- Add a simple mission select with **Standard Routing** and **Logic Gate Routing**; both are available without unlocking or persistent progression.
- Keep the standard level as the existing one-source/one-destination route around D3.
- Add a second small board with two clearly labeled inputs, one fixed AND gate, and one output destination. The gate output becomes active only when both inputs are connected.
- Change placement resolution so a later wire command replaces the wire already in that cell and immediately recalculates the energized path. Replacing a live wire still applies the short penalty, then leaves the new wire in place. Fixed source, destination, obstacle, and gate cells cannot be replaced.
- Show who replaced a tile and which orientation is now active in the crew feed.
- Keep both levels on the same pilot/bullet-hell loop; do not add more gate types or new hazards in this slice.

**Exit:** Both levels are playable locally; the normal route and AND output are correct; later wire placements visibly replace earlier ones; a live replacement both changes the wire and triggers its short consequence.

### 1B. Scalable multi-board routing — implemented

- Change the two mission types into reusable **Standard** and **AND Gate** board templates; keep one board active at run start. Each board has a visible ID, independent grid/seed/progress, and uses a board ID plus two direction words (for example, `!b2 wire C3 LEFT DOWN`).
- Count unique active chatters from distinct Twitch `chatter_user_id` values observed in a rolling activity window. Count a chatter once per window regardless of message volume; do not use total viewers or persist the IDs after the run. Lurkers are not measurable through received chat messages.
- Let `n` be unique active chatter IDs in the rolling window and `K = 100` the initial target active-chatters-per-board. Chat-driven board target: `max(1, ceil(n / K))`, so one board serves up to 100 active chatters, two serve 101–200, and so on. Capacity is `min(100, max(2, ceil(n / K) + 1))`, preserving one spare hit-triggered board where the hard cap allows. Start with one board, never two. Introduce chatter-backed boards gradually; a pilot hit can also introduce one extra board early. Throttle hit-triggered creation to one board per eight seconds. At cap, hits continue to apply normal danger/damage without adding a board. Capacity may grow during a run but does not shrink; never remove a board mid-run because activity declines. Tune `K` and the hard cap after playtesting.
- Set a practical configurable board cap for the prototype. The initial layout showed the first two boards as full grids; Phase 1D supersedes that presentation with one selected full-grid board at a time and numbered navigation. Keep all command targets visible in board navigation.
- Generate maps from a run seed and board ID using bounded randomized source/target/obstacle layouts. Search over grid position and incoming direction so route turns can be converted into valid wire orientations. Use seeded A* tie-breaking or route costs to vary route length and turns, then validate it through the game’s real connectivity rules. The AND template must validate both input paths and its output. Keep deterministic seeds available for reproducing bugs.
- Define the multiple-board win condition before coding. Recommended first pass: extraction requires every board created during that run to be powered; each new board is a legible extra repair task created by growth or a pilot hit. Playtest recovery at the lowest and highest board caps before tuning difficulty.
- Keep local/demo mode useful: add a development control to simulate unique chatter arrivals and pilot-hit board creation without requiring Twitch. Do not change the Twitch authentication flow in this phase.

**Exit:** Implemented in the local prototype: a run starts with one board; low activity caps at two; unique chatter growth raises the cap; hits add boards within capacity; commands target a board; seeded maps are route-validated; overflow boards appear in the overview. Hands-on browser playthrough and high-count balance checks remain.

### 1C. Board navigation and local scaling pass — implemented; hands-on balance QA pending

- Keep B1 pinned in the left panel; show B2 in the right panel when it exists, and let a click on any B2+ list entry load that board into the right panel. The list must show each board ID, template, solved state, and recent placement activity so viewers can pick a board that needs help. With only B1 active, keep the right panel as a clear “next board” status panel.
- Keep board IDs in the command grammar (`!bN wire CELL SIDE SIDE`) and show the selected board’s ID beside its grid. Unknown, solved, or unavailable boards should receive a short, useful response.
- Expand local simulation presets to add 100, 1,000, or 10,000 distinct active chatters and simulate a pilot hit. Use them to inspect the one-board start, low-activity two-board ceiling, each 100-chatter tier, pacing, and the 100-board cap without connecting Twitch.
- Play through both templates at low, medium, and high board counts. Check that all generated maps remain solvable, generated board layouts remain visible when selected, every board can be addressed, and requiring every board before escape still feels achievable under hull pressure.
- Tune only the clearest blockers: `K = 100`, board spawn pacing, hit cooldown, objective pressure, and overflow navigation. Keep the two current templates and current hazards; do not add a third template or a new subsystem in this pass.

**Exit:** Any active board can be inspected and addressed with its command ID; the overview makes unfinished/quiet boards easy to find; local simulations exercise activity tiers through the hard cap. Both templates still need hands-on browser playthroughs at low, medium, and high board counts to confirm solvability and that all-board extraction remains achievable under hull pressure.

### 1D. Single-board view and all-directions danmaku — implemented; hands-on QA pending

**Design interpretation:** One shared board is the default routing space for up to 100 unique active chatter IDs. At 101–200, the target grows to two boards, then one more per 100-active-chatter tier (capped at 100). Viewers are never locked to an assigned board: `!bN` directs a placement to any active board. The streamer selects which board page is shown. No per-viewer board roster or separate chat rooms in this MVP.

- Replace the simultaneous B1/B2 grids with one full-size routing board viewport and simple previous/next or numbered board tabs. Keep each board’s ID prominent so the visible board and `!bN` command stay aligned. Switching pages changes only the displayed grid; every board retains its state and remains part of the round objective. B1 is the default shared board; viewers can target another board explicitly with its `!bN` prefix.
- Recompose the play area: one routing board on one side and a near-square flight arena on the other, instead of two boards above a shallow horizontal flight strip. Aim for an arena aspect ratio close to 1:1 (roughly 520 × 560 internal pixels as an initial layout target), and keep both the selected board and the pilot visible at stream size. Preserve the existing DOM HUD and Phaser canvas approach; use Phaser `FIT` scaling to preserve the arena’s aspect ratio across embeds.
- Replace the current horizontal volleys and safe-lane warnings with immediate projectile patterns arriving from all four arena edges and occasional radial bursts. No pre-attack warning labels or safe-gap callouts. Make attacks fair through slow readable projectiles, repeatable pattern timing, distinctive bullet colors/shapes, persistent escape gaps, and a clear collision/hit effect.
- MVP pattern set: (1) aimed fans from alternating arena edges, (2) a rotating radial ring from an off-center emitter, and (3) a slow edge sweep that leaves an opening. Use deterministic run seeds and a small timed pattern scheduler; ramp density only after the player has seen the pattern family. Avoid free-aim enemy AI, boss phases, weapon systems, power-ups, and new board mechanics.
- Use Touhou as broad danmaku inspiration: dense geometric curtains that reward threading through visible gaps, plus a small visibly marked collision core on the ship. Do not copy Touhou characters, assets, named attacks, or exact patterns. Keep the existing one-button movement set; add a slower focused-movement modifier only if playtesting shows precise threading is too difficult.
- Add player lives or a small hit budget with brief invulnerability after impact so several projectiles in one cluster do not drain the run in one frame. Revisit the existing danger meter only if the bullet-hell loop makes it redundant; do not stack health, danger, and short penalties without a clear purpose.
- Validate at 100, 1,000, and 10,000 simulated active chatters; confirm board-page navigation, a selected board’s command targeting, bullets from all directions, hit fairness, and collision readability at stream resolution. Play both Standard and AND boards while dodging.

**Exit:** Implemented: one board grid appears per view, the board buttons select the page, B1 is the default, and viewers can target any active board with `!bN`. A 570 × 570 arena runs aimed fans, radial bursts, and edge sweeps from all sides with no warning UI, a marked collision core, swept collision checks, and brief hit invulnerability. Hands-on visual, stream-scale, and balance QA remain before Twitch smoke testing.

### 2. Twitch command adapter

- Connect/disconnect Twitch, show status, and subscribe to the broadcaster’s chat.
- Parse one concise board-targeted placement command, `!b1 wire B2 UP RIGHT`; accept two distinct full directions from UP, DOWN, LEFT, RIGHT and translate those ports to the existing wire shape. Document the syntax and board-ID examples in the start screen.
- Validate channel, message, board ID, coordinates, tile/orientation, round phase, per-viewer cooldown, and global input pace before creating a game command.
- Deduplicate EventSub notifications by message ID and display only a small rolling feed of accepted actions and useful rejections.
- Preserve a demo mode when Twitch is disconnected or authorization is unavailable.

**Exit:** A real viewer command changes the same game state as a local demo command in the broadcaster’s channel; disconnect/reconnect and malformed or bursty messages leave the round usable.

### 2A. Live Twitch smoke session — after Phase 1D

- Open the local app at `http://localhost:5173/`, connect with the Twitch app Client ID, and confirm the UI reaches **TWITCH CHAT CONNECTED**.
- Start a short stream with OBS capturing the game window. Use a second Twitch account/device to send commands in the channel chat.
- Verify valid placement on each active board, a complete route for each active board template, a deliberate live-wire replacement/short, one malformed/unknown-board command, per-viewer cooldown, and disconnect/reconnect.
- During the same run, have the streamer dodge all-directions patterns while chat routes power. Record whether the streamer has a meaningful task and whether a first-time viewer can follow the projectile gaps and selected-board state.
- Confirm unique chatter count, board-cap growth, board IDs, board selection, and a hit-triggered board using a small live channel after local scaling has been exercised.
- Keep local/demo input available if authorization or EventSub is unavailable; record the exact error/status before changing code.

**Exit:** A real `!b1 wire` chat message is visibly acknowledged and changes the intended board, both board templates work through chat, a replacement/short has an obvious consequence, and the pilot can finish a round while dodging.

### 2B. One focused tuning pass

- Adjust only the highest-impact issues observed in the live session: command readability, pattern density/speed, gap readability, or hit/invulnerability timing.
- Repeat one short run after each adjustment. Keep the board and bullet pattern simple until both roles are readable together at stream size.

**Exit:** The streamer has an active dodge task while chat routes, and neither role hides the other’s consequences.

### 3. Stream-ready demo

- Deploy the app to HTTPS and configure exact OAuth redirect URLs.
- Test at typical stream viewing size and on a second device/browser.
- Tune the time pressure and short penalty so viewers can understand the result quickly and recover from mistakes.
- Verify disconnect/reconnect, expired/revoked authorization, round reset, and no-chat fallback.
- Prepare a one-minute demo sequence and a clean reset path.

**Completion:** A reliable public demo link runs one complete local or Twitch-connected round and makes the viewer-to-game consequence obvious. Stop here before adding vertical-slice content.

## Research checkpoints

Research should recur at decision points rather than be a one-time kickoff. Before each phase begins, re-check the relevant primary sources and record the date, decision, and any changed constraint in this plan or a short decision log. Re-check at least every three working days during active implementation, and immediately after any Twitch auth/API failure or material change in intended hosting.

- **Before Phase 0:** Confirm the current Twitch app registration, chat authorization scopes, chat-message EventSub subscription, and WebSocket lifecycle. Starting references: [Twitch Chat & Chatbots](https://dev.twitch.tv/docs/chat), [Authenticating and Setting up EventSub](https://dev.twitch.tv/docs/chat/authenticating), [Handling WebSocket Events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events), and [OAuth access tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth).
- **Before Phase 1:** Review current browser rendering/input options against team skills; make a tiny rendering spike before committing to a framework. Revisit game-design risks from the GDD: command legibility, simultaneous placements, board readability, and whether the short is funny/tense rather than opaque.
- **Before Phase 1A:** Lock the two-input AND truth table, gate pin layout, and replacement/short feedback. Use the standard two-input truth table and verify the visual shows each input and output independently. Starting reference: [All About Circuits — Multiple-input Gates](https://www.allaboutcircuits.com/textbook/digital/chpt-3/multiple-input-gates/).
- **Before Phase 1B:** Re-check the EventSub `channel.chat.message` payload and use its stable chatter ID to estimate distinct active chatters; explicitly treat this as chat activity, not total audience size. Review A* as a path-search method, then pair seeded path costs/tie-breaking with the game’s own connectivity validator. Starting references: [Twitch EventSub Reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference), [Red Blob Games — A* introduction](https://www.redblobgames.com/pathfinding/a-star/introduction.html), and the original [Hart, Nilsson, Raphael A* paper](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/astar.pdf).
- **Before Phase 2:** Re-check Twitch’s current `channel.chat.message` authorization requirements, WebSocket reconnect and duplicate-event behavior, rate limits, and token-validation rules. Starting references: [Sending and Receiving Chat Messages](https://dev.twitch.tv/docs/chat/send-receive-messages), [EventSub WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events), and [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types).
- **Before Phase 3:** Re-check hosting HTTPS/OAuth redirect behavior and Twitch token handling. Run a short observed play session and adjust only the highest-impact clarity or pacing issue; avoid expanding features.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Twitch OAuth/EventSub takes longer than the game loop | Prove chat receipt in Phase 0; retain a functional local/demo input path. |
| Chat flood or repeated placements overwhelms the round | Queue commands, deduplicate events, apply per-viewer and global limits, and show accepted actions only. |
| Viewers cannot infer tile syntax or board coordinates | Keep the grammar to one command, show coordinates and an example, and test with first-time viewers. |
| Shorts feel arbitrary or make the board unreadable | Make the triggering wires and consequence explicit; tune one bounded penalty before adding more rules. |
| Pilot controls compete with board attention | Keep movement simple and the ship HUD small; validate at stream scale before adding hazards. |
| Board count balloons or disappears confusingly as chat changes | Use a run-level hard cap and paced creation; never remove an active board during a run. At the cap, hits cause normal damage only. |
| Random maps are impossible or feel arbitrary | Seed each board; constrain route length/turns; verify every generated route with the same connectivity rules as gameplay; keep a reproducible seed in local logs. |
| Board IDs make commands harder to learn | Make the board prefix visible on every grid and show one example command; reject missing/unknown IDs with a short hint. |
| Browser token/session behavior changes or creates exposure | Keep secrets out of the client, minimize token lifetime/storage, validate authorization, and re-check Twitch guidance at the integration checkpoint. |

## Prototype success measures

- A new viewer can explain the objective after seeing a few seconds of play.
- A chat command produces a visible board change and readable feedback.
- A valid connection and a short both have obvious, immediate consequences.
- A full round can be completed or failed and reset without developer intervention.
- The local/demo path remains usable when Twitch is unavailable.
- Board count responds to distinct active chatters and pilot hits, while a low-activity run remains at one or two legible boards.

## Implementation status

- **Phase 0 — stack setup:** Phaser 4 + TypeScript + Vite selected and installed. Local EventSub verification is pending Twitch app registration/configuration.
- **Phase 1 — local playable loop (historical baseline):** Implemented and user-confirmed for the standard level: one 7 × 5 grid, A3 power core, G3 drive, blocked D3, six wire orientations, keyboard flight, short penalty, win/loss, restart, local command input, swept bullet volleys, moving safe gap, collision damage/knockback, and hit feedback. The danger-meter loss/pressure was later replaced by Plane Systems.
- **Phase 1A — two missions and replaceable wires:** Implemented. Players can choose Standard Routing or Logic Gate Routing. The logic mission requires both labeled inputs to power the fixed AND gate before its output can energize the drive. Latest placement replaces the cell’s previous wire; replacing an energized wire still applies the short penalty, then recalculates power using the new orientation. Local command sequences for both routes are in the README. `npm run build` passes; a hands-on browser playthrough of both routes and the replacement consequence remains the next QA step.
- **Phase 1B — scalable multi-board routing:** Implemented. Runs start with one board, with the chat-driven target at roughly one board per 100 unique active chatter IDs (one board through 100, two at 101–200, etc.). Capacity preserves a two-board low-activity maximum and one additional hit-triggered slot where possible; pilot-hit additions are limited to one per eight seconds. Commands target boards by ID. Standard maps use seeded A* route search; AND maps retain clear, separated input routes with seeded obstacle variation. Both are validated with the same connectivity rules used in play. All active boards must be powered before extraction. Hands-on gameplay and load/balance tuning remain.
- **Phase 1C — board navigation and local scaling:** Implemented. The overview reports template, solved state, accepted wire-placement count, and recent activity. Local controls add 100, 1,000, or 10,000 distinct simulated chatter IDs or trigger a pilot hit. Phase 1D replaces the dual-grid presentation with a single selected board.
- **Phase 1D — single-board view and all-directions danmaku:** Implemented. One 7 × 5 board grid is selected from numbered buttons, with B1 as the default. The square flight arena is 570 × 570 and includes four-edge aimed fans, radial rings, and edge sweeps; warning/safe-lane UI is removed. The ship has a visible center hit core, swept projectile collision, and 1.15 seconds of invulnerability after a hit. `npm run build` passes; playthrough and stream-scale balance QA remain.
- **Phase 2 — Twitch adapter:** Adapter implemented: browser OAuth, state check, token validation, EventSub WebSocket subscription, reconnect/revocation handling, duplicate suppression, per-viewer/global command pacing, and visible connection state. Live authorization and chat receipt are the next verification tasks.
- **Plane Systems core feature — implemented 2026-10-28:** Six damageable aircraft parts, gameplay multipliers, hit/short damage, finite board-earned chat repair (`!repair <part>`), all-parts-destroyed loss, and full-screen Phaser HUD are implemented. Local/demo and Twitch commands share the bounded frame-boundary input queue. Details and decisions are in `PLANE_SYSTEMS_PLAN.md`; playthrough, balance, stream-scale, and live Twitch verification remain.
- **Core input integration — completed 2026-10-28:** Demo, simulated activity/hits, and Twitch wire commands enter bounded queues in `GameScene`; commands are applied at the start of the Phaser update frame (up to 16 placements per frame), keeping Twitch callbacks from mutating gameplay mid-frame. Chatter IDs are drained in batches to avoid a single 10,000-chatter simulation spike.
- **Twitch lifecycle hardening — completed 2026-10-28:** EventSub keepalive watchdog, safer replacement-socket handoff, stale-socket close protection, permanent 4xx subscription failure handling, and visible throttling notices are implemented. OAuth remains browser-only with no client secret. Live authorization/chat behavior is unverified until run with the registered Client ID and channel.
- **Campaign menu / gameplay-readability slice — implemented 2026-10-29:** Semantic DOM flight desk, Continue/New Save campaign flow, Standard-to-AND unlock and replay selection, versioned local campaign save with separate display settings, fullscreen/UI scale/reduced-motion/screen-shake controls, original flight-manual visual direction, removed noisy hit/capacity status, corrected board-header hierarchy, four seeded no-warning projectile families with safe emission distance, and seeded randomized Standard/AND maps validated with `calculatePower`. Production build passes; browser flow, viewport and property checks passed. Portrait flight view asks for landscape. Live Twitch and stream-scale balance remain unverified.
- **Phase 3 — stream-ready demo:** Pending. Requires an HTTPS host and adding the exact deployed URL as a Twitch OAuth redirect URL, then a live-channel session to tune pacing and confirm the connection.

## Latest implementation slice — campaign menu and gameplay readability

**Delivered 2026-10-29:** The following architecture and product decisions now describe the implemented prototype. They remain the acceptance contract for follow-up fixes and Twitch/stream-scale QA.

### Product decisions

- The main menu offers **Continue**, **New Save**, **Connect/Disconnect Twitch**, and **Settings**. Twitch remains optional; the local demo command panel remains usable without authorization.
- One local campaign profile is supported. A new profile starts at Standard Routing. Winning Standard unlocks the existing AND-gate mission. Continue starts the earliest unlocked incomplete mission as a fresh sortie; it does not restore a mid-run state. When both missions are complete, Continue opens mission replay selection.
- New Save asks for confirmation, resets campaign progress, and preserves display preferences. Settings use a separate storage key from campaign progress.
- v1 settings are fullscreen, UI scale, reduced motion, and screen shake. Do not add audio settings until audio controls exist.
- Reconnect the existing Twitch adapter from the menu without replacing its OAuth/EventSub lifecycle. Keep tokens in memory only; never put them in campaign or settings data.
- Visual direction: an original **flight manual / instrument-panel** language for Dead Circuit—ink-dark field, warm pale labels, restrained teal/amber/red status colors, one condensed title face paired with readable body text, compact coordinate typography, hard edges and thin separators. Use asymmetric composition and a clear primary action; avoid generic card grids, all-caps-everywhere copy, nested rounded panels, and decorative glow without a gameplay purpose. Create original marks and textures; do not copy a particular website’s layout, assets, or trade dress.

### Architecture and work order

1. **Campaign state and storage contract**
   - Add a small framework-independent campaign model and pure operations for starting/resetting a profile, selecting the next mission, and recording win/loss outcomes.
   - Persist a versioned campaign record with unlocked/completed mission IDs. Do not persist the active board, ship state, Twitch identity, access token, or EventSub session.
   - Store campaign and global display settings separately. Treat missing, malformed, or unsupported stored data as a safe new profile/default settings, without blocking launch.
2. **Menu shell and app orchestration**
   - Put menu, settings, and confirmation dialogs in semantic DOM controls layered with the Phaser game rather than drawing interactive text/buttons into the canvas. Keep Phaser responsible for the game world and simulation; add a small app-level controller to coordinate campaign, scene transitions, settings, and the existing Twitch adapter.
   - First boot: one prominent **Start / New Save** action, with Twitch connection and Settings as secondary actions. Existing profile: **Continue** is primary; **New Save**, Twitch connection state/action, and Settings remain easy to find.
   - Show a compact connection state (offline, connecting, connected as channel). Keep Local Demo available whether Twitch is connected or not. Fullscreen must be requested directly from the user’s click/tap and report unsupported/failed states plainly.
   - Use native buttons, labels, keyboard focus order, visible focus, Enter/Space activation, Escape to close dialogs, and reduced-motion-aware transitions.
3. **Gameplay hierarchy and feedback cleanup**
   - Remove the prominent “DANMAKU FLIGHT DECK” canvas title.
   - Remove the noisy combined impact/capacity toast, including “board capacity reached.” Convey hit/part damage through the affected part card and aircraft feedback; let board count/navigation show a board addition. If a temporary status is needed, use short, concise, non-overlapping command/result feedback.
   - Rebuild the routing header hierarchy as title, board metadata/page controls, column labels, then grid; keep row labels outside cells. Preserve the board-left / flight-arena-right relationship and square arena.
   - Fix the current overlap between generic round/event copy and the Aircraft Systems heading. Avoid a persistent generic “round active” sentence. Keep the test panel collapsed unless explicitly opened.
4. **Fair, varied no-warning danmaku**
   - Keep attacks untelegraphed as requested, but make each pattern readable through shape, spacing, speed, and a persistent open lane.
   - Reject any emitter/projectile origin within 160 logical pixels of the ship at emission. For direct aimed attacks, preserve at least 0.7 seconds of travel time at the actual velocity. If a selected pattern cannot satisfy those constraints, select a safe emitter or defer that spawn.
   - Implement four original pattern families with tunable ranges: fast small needles in a narrow fan; slow large drifters; medium radial rings from a safe emitter; and measured edge rakes that preserve a deliberate gap. Vary size, velocity, spread/count and timing. Do not repeat the same family immediately; cap active density and retain usable movement lanes.
   - Keep pattern choice and projectile motion deterministic from the run seed and in the pure game core. Phaser should render the resulting projectile state; do not add a physics dependency just for these patterns.
5. **Seeded randomized boards with a solvability guarantee**
   - Keep the existing 7 × 5 board and left-to-right signal flow, while randomizing special-cell positions inside readable bands: Standard source x=0–2 and drive x=4–6; Logic inputs x=0–2, gate x=2–4, and drive x=4–6. Randomize rows, avoid overlapping special cells, and randomize legal gate input/output sides.
   - Use seeded candidate generation and port-aware A* route synthesis (including incoming direction in the search state) to create guaranteed route candidates. Place optional obstacles only after reserving special cells and required routes; reject candidates with awkwardly short, tangled, or visually clustered routes.
   - A* proposes routes; it does not prove that the actual game board works. Validate each final candidate with the same `calculatePower` rules used during play: Standard must power the drive; Logic must deliver both inputs through the correct gate pins and power the drive. Retry within a fixed bound, then use a known-valid seeded fallback. Never display an unchecked candidate.
   - Derive each board layout from the existing run/board seed so a reported seed reproduces the same board.
6. **Verification and review**
   - Browser property checks covered campaign transitions/storage decoding, 300 seeds per board type for deterministic unique in-bounds placements, and 160 projectile emissions across five ship locations for all four families, spawn radius, and aimed-shot travel time. A dedicated automated test runner remains a follow-up.
   - Run a production build and browser review at 1440 × 900, 1280 × 720, and a narrow 390 × 844 viewport. Review first-load menu, settings/dialog keyboard flow, live game HUD, each pattern family, and both board templates. The desktop and mobile menu/settings and gameplay views were reviewed; portrait flight now prompts landscape.
   - After local verification, do a real-channel Twitch smoke test only when app credentials and an authorized channel are available; hosting remains a separate Phase 3 task.

### Acceptance criteria

- A first-time visitor can identify the primary action quickly, start locally without Twitch, and reach either mission through the intended campaign rules.
- Continue, New Save confirmation/reset, refresh persistence, malformed-save recovery, and preservation of display settings behave as specified.
- Connect/disconnect and connection state use the current Twitch adapter; no OAuth token is written to browser storage.
- Settings work with pointer and keyboard; fullscreen errors are communicated; reduced motion affects transitions and shake.
- The board labels and systems HUD do not overlap at target desktop sizes; the game remains understandable at the narrow review size. The specified title and combined noisy hit/capacity message are absent.
- No projectile spawns inside the no-spawn radius, and direct aimed attacks respect the minimum travel time. All four pattern families are visibly distinct and preserve a navigable gap.
- For a fixed seed and template, generated maps repeat exactly. For a broad seeded sample, all specials stay in bounds and unique, no obstacle blocks a required path, and every displayed Standard/Logic board passes `calculatePower` validation. Invalid candidates always fall back to a valid board.

### Research checkpoints

- **Before menu implementation:** Recheck Phaser scene ownership and browser fullscreen behavior; the current choice is an app/DOM menu coordinating Phaser scenes, with fullscreen initiated by a direct user gesture. Phaser documents Scenes as a fit for menus and Scale Manager fullscreen controls/events: [Phaser Scenes](https://docs.phaser.io/phaser/concepts/scenes), [Phaser Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager).
- **Before persistence implementation:** Recheck browser storage constraints and origin behavior. Local storage is origin-scoped and survives browser sessions, so campaign progress and global preferences remain local to the deployed origin; private browsing/storage denial must degrade safely: [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [MDN Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API).
- **Before danmaku tuning:** Review the current Phaser rendering/performance guidance and test density at the intended stream resolution; tune from observed play rather than adding pooled rendering preemptively.
- **Before map generation:** Recheck A* invariants and the current board’s exact power/gate rules. Keep deterministic seeds, bounded retries, and gameplay-rule validation; do not treat path search alone as proof of solvability.
- **Before live Twitch verification/hosting:** Recheck current Twitch OAuth and EventSub requirements, redirect URLs, scopes, and reconnect rules against official documentation.

### Research log — 2026-10-27

- Checked current official Phaser guidance and package registry metadata. Selected Phaser **4.2.1**, TypeScript **5.9.3**, and Vite **7.3.7**. Phaser’s official project guidance supports TypeScript and bundler templates; Phaser is 2D-focused, which matches the prototype.
- Re-checked Twitch’s official chat, EventSub, and authentication documentation. The adapter uses `channel.chat.message` with broadcaster authorization and `user:read:chat`, EventSub WebSockets (preferred over IRC), Twitch token validation at startup and hourly, duplicate message-ID suppression, and the documented reconnect flow.
- Reviewed bullet-pattern and telegraphing guidance for the prior volley design. User direction now replaces warning-based volleys with no-warning danmaku. Before implementation, use fair pattern timing and visible gaps instead of warning UI, and tune projectile speed/density so movement remains expressive.
- Researched the second level’s gate rule. A two-input AND outputs active only when both inputs are active, so the board should show both inputs separately and the output state directly. Reference: [All About Circuits — Multiple-input Gates](https://www.allaboutcircuits.com/textbook/digital/chpt-3/multiple-input-gates/).
- Re-checked Twitch EventSub’s official reference for the current `channel.chat.message` payload. It includes `chatter_user_id`, allowing the connected app to count distinct message senders over a rolling window; it cannot count silent viewers. Reference: [Twitch EventSub Reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference).
- Reviewed the A* introduction and original paper. A* searches for a least-cost path; it does not generate randomness by itself. Plan: add seeded variation to route costs/tie-breaking, then validate the resulting wire/gate map through the same rules used by the game. References: [Red Blob Games — A* introduction](https://www.redblobgames.com/pathfinding/a-star/introduction.html), [Hart, Nilsson, Raphael (1968)](https://ai.stanford.edu/~nilsson/OnlinePubs-Nils/PublishedPapers/astar.pdf).
- **Before Phase 1D — 2026-10-27:** Re-checked Phaser 4 guidance. Use `FIT` scaling for a fixed near-square arena inside the browser layout; keep pattern definitions, seeded timing, projectile motion, and collision in the pure TypeScript game core. Phaser Groups support pooling similar objects, while Phaser notes complex, frequently redrawn Graphics can be expensive; start with the current lightweight projectile model, profile representative bullet counts, and add pooled sprites only if needed. Design reference: the official Touhou listing describes weaving through screen-filling barrages; adapt that broad dodge-and-threading feel with original patterns and no copied assets/attacks. Sources: [Phaser Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager), [Phaser Groups and pooling](https://docs.phaser.io/phaser/concepts/gameobjects/group), [Phaser Graphics performance](https://docs.phaser.io/phaser/concepts/gameobjects/graphics), [Touhou Koumakyou: The Embodiment of Scarlet Devil](https://store.steampowered.com/app/4659620/__the_Embodiment_of_Scarlet_Devil/).
- Next research checkpoint: during Phase 1D QA, profile the renderer with target projectile counts and tune patterns at stream resolution; before the live Twitch smoke, reconfirm OAuth, authorization, and EventSub behavior.

### Research and implementation log — 2026-10-28

- Re-checked current official Twitch documentation before changing the adapter. The browser implicit grant remains documented for client-only apps; chat subscriptions use `channel.chat.message` with `user:read:chat`; EventSub WebSocket clients must honor the Welcome keepalive timeout and use the reconnect URL as provided. The active connection should be retained until the replacement receives Welcome. References: [OAuth access tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth), [Chat authentication](https://dev.twitch.tv/docs/chat/authenticating), [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types), [Handling WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events), [WebSocket messages](https://dev.twitch.tv/docs/eventsub/websocket-reference).
- Applied those lifecycle rules to the Twitch adapter, including keepalive timeout recovery and replacement connection handling; transient server/rate-limit errors retry, while permanent client errors end the session with visible status.
- `GameScene` now consumes gameplay inputs at a Phaser frame boundary with bounded per-frame work. This preserves ordered chat actions and prevents large simulated chatter additions from monopolizing one update.
- Verification: production build passes. The existing Vite large-chunk warning remains. No live Twitch smoke has been run because it requires the user's Twitch app Client ID and an authorized broadcaster/channel.

### Research and implementation log — 2026-10-29

- Re-checked official Phaser Scene and Scale Manager guidance before moving menu/settings/result surfaces into semantic DOM and keeping the canvas responsible for playfield rendering. Fullscreen is requested from the settings button’s direct click and listens for browser failure/enter/leave events. References: [Phaser Scenes](https://docs.phaser.io/phaser/concepts/scenes), [Phaser Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager).
- Re-checked browser storage behavior before implementing local campaign/settings persistence. Campaign and settings use separate versioned localStorage keys; corrupt/unsupported records fall back safely, and storage denial reports session-only progress. Twitch access tokens remain in memory. Reference: [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
- Implemented and reviewed the campaign flight desk, settings, status dialogs, round result flow, game-header cleanup, safe projectile families, and seeded board generation. Browser review covered 1440 × 900, 1280 × 720, 390 × 844, and 844 × 390. Portrait gameplay presents a landscape prompt; the menu and settings remain responsive.
- Browser-driven core checks: campaign progression/replay and malformed-save decoding; 300 deterministic seeds each for Standard and Logic layouts; 160 emissions across five ship positions, covering all four pattern families, the no-spawn radius, and aimed-shot travel time. `npm run build` passes. A live Twitch session and stream-scale audience balance were not verified.

## Decisions deliberately left open

- Exact grid size, round duration, ship movement feel, and command cooldown values.
- Final tile vocabulary and how the demo explains connection/crossing rules.
- Hosting provider and final board/round tuning, pending the live smoke session.
