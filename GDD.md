# DEAD CIRCUIT — Game Design Document

**Document status:** Prototype design, implementation in progress  
**Design focus:** A small, stream-readable prototype of collaborative circuit routing under pressure.

## 1. Game Overview

- **Title:** DEAD CIRCUIT
- **Genre:** Cooperative party puzzle / arcade survival
- **Target platform:** PC, designed to be played by a streamer and watched in a Twitch browser or player.
- **Target audience:** Streamers and viewers who enjoy quick team puzzles, playful sabotage, and emergent chat moments. No electronics or logic-gate knowledge should be required.
- **Premise:** A pilot dodges incoming fire while Twitch chat routes power across a shared grid. Viewers build together, compete for limited space, and risk shorting the circuit.
- **Design pillars:**
  1. **Understand it at a glance:** power travels from source to a clearly marked destination.
  2. **Every action shows:** accepted placements, current, shorts, and ship status are visible on the board.
  3. **Shared stakes create stories:** chat must coordinate under pressure, and mistakes have immediate consequences.
  4. **Small, repeatable rounds:** one successful or failed run should take only a few minutes.

## 2. Gameplay Mechanics

### Roles and controls

- **Streamer / pilot:** Steers the ship through a near-square danmaku arena using keyboard controls. The pilot threads visible bullet patterns arriving from all sides; attacks do not use pre-attack warning labels.
- **Viewers / engineers:** Send a command in Twitch chat to place or rotate a wire tile on the shared grid. The game acknowledges valid commands on screen.

### Round loop

1. The pilot starts a run with one numbered routing board. Standard and AND-gate layouts are board templates; additional boards can appear as active chat grows or the pilot is hit.
2. The pilot dodges incoming patterns while viewers route power on the default board or choose another active board by ID (for example, `!b2 wire B3 LEFT RIGHT`).
3. The screen shows one selected board at a time. Switching board pages changes only the grid being viewed; every board keeps its independent progress. The board tabs show which boards need work.
4. The latest wire command replaces the wire already in that cell. Replacing an energized wire causes a visible short flash and raises danger; the new wire still takes effect and power is recalculated immediately.
5. The round ends when the ship reaches the exit or its danger meter fills. Show the outcome and a compact run summary, then allow a quick restart.

### Rules and MVP scope

- Two reusable shared-board templates: a one-source route and a two-input logic-gate route. Each board uses a destination and a small set of readable wire tiles (straight and corner pieces; crossings only if they remain immediately legible).
- Wire tiles occupy grid cells. A new wire placement replaces the previous wire in that cell and immediately recalculates the circuit. Fixed source, destination, hull, and gate cells cannot be overwritten; commands targeting them receive brief feedback.
- Power follows connected wire edges. A completed path visibly energizes from source to destination.
- **Level 1 — Standard Routing:** Route one source to one destination around blocked hull using ordinary wire pieces.
- **Level 2 — Logic Gate Routing:** Route two labeled input signals into a fixed AND gate, then route its output to the destination. The output energizes only when both inputs are powered. Start with this single gate type; more gate types are outside the initial scope.
- Replacing an energized wire causes a clear, bounded short penalty, flashes the affected cell, and increases danger; the new wire orientation takes effect immediately and power is recalculated.
- The ship has one simple steering scheme and a small set of geometric projectile patterns from all four arena edges, plus radial bursts. A hit has a small marked collision core, readable hit feedback, and brief invulnerability so one cluster cannot drain several lives at once. Pilot skill adds pressure without requiring weapons, enemy AI, or upgrades.
- No persistent progression, inventory, a broad gate catalog, or multiple ship systems in the initial prototype.

### Scalable routing boards

- Count **unique active chatters**, not total viewers: use distinct Twitch chatter user IDs that sent a chat message during a rolling activity window. This measures people visible to the chat integration; lurkers do not count. Keep the IDs in memory for the current run only.
- Start each run with one shared board. The chat-driven target is roughly one board per 100 unique active chatters: B1 serves up to 100, B2 serves 101–200, and so on. A pilot hit can expose one extra board beyond the chatter-driven target where capacity allows; keep the low-activity capacity at two so a hit can open B2 without making it appear automatically.
- Use a rolling two-minute window and `K = 100` active chatter IDs per board as the initial tuning. Throttle hit-triggered board creation. If the run is already at its current cap, a hit applies normal damage without creating another board. Never remove an active board mid-run when chat activity falls; capacity is run-latched and is re-evaluated on the next run.
- Each board has a visible `B1`, `B2`, … ID, its own grid, seed, objective, and progress state. Twitch commands name the destination board and use full port directions (`!b2 wire C3 LEFT DOWN`) so placement is unambiguous without memorizing tile abbreviations. Keep the command queue, deduplication, and per-user pacing shared across boards.
- A pilot hit can expose the next board early, representing damage opening another repair route. It only happens below the current board cap and is throttled; hits at cap continue to damage the ship without adding more boards.
- Prototype rule: chat-driven board target is `max(1, ceil(n / K))`; capacity is `min(100, max(2, ceil(n / K) + 1))`, leaving a hit-triggered slot where possible. Thus 0–100 active chatters target one board, 101–200 target two, and low activity still permits a hit to open B2. Viewers are not locked to an assigned board or chat room: the board prefix in each command lets anyone route on any active board. The streamer selects the board page shown on screen.
- Generate each map from a deterministic run seed plus board ID. Randomize route shape and obstacle placement within authored bounds. Use a route-search step (A* with seeded tie-breaking/cost variation is a candidate) to create a route with a target length/turn count, then validate it with the same port and gate rules used by gameplay. Reject and regenerate any unsolvable map. For AND boards, validate both input paths and the gate output independently.
- Show one full board grid per view/page, with prominent numbered board tabs and completion/activity summaries for navigation. A board page switch must never reset or hide progress on the other boards.
- **Round condition:** every active board must be powered before extraction is available. Playtest whether hit-created work remains recoverable as board count and chat activity rise.

### Success and scoring

- **Primary outcome:** Reach the exit before the danger meter fills.
- **Run summary:** Show completion/failure, time, boards introduced/completed, successful power connections, and number of shorts. Treat this as feedback, not a competitive leaderboard in the MVP.
- Reward clear teamwork and entertaining recovery, not raw chat message volume.

## 3. Story and Narrative

- **Setup:** The crew’s ship is limping through a dangerous sector after a cascading electrical failure. The pilot can keep it moving, but the crew must reroute power to survive.
- **Characters:** The streamer is the pilot. Chat is the ship’s improvised engineering crew. A brief onboard computer voice provides status callouts.
- **Tone:** Scrappy science-fiction emergency with room for comedy; failures should feel dramatic and readable rather than punishing.
- **Narrative delivery:** One-sentence mission briefings and short status lines at key events (system failing, power restored, short, escape/failure). Story supports the round and does not interrupt play.
- **World building:** A compact ship interior, hazard field, and destination beacon establish the setting. Broader lore is outside prototype scope.

## 4. Level Design

- **Prototype layout:** One selected numbered routing board sits beside a near-square flight arena. Numbered board tabs let the streamer switch grids without leaving the flight view; all board IDs remain visible for chat commands. Standard and AND-gate maps remain reusable templates.
- **Round structure:** Briefing → one board starts → simultaneous piloting and routing → active-chat or hit events may add boards → resolve active boards and reach the exit, or fail → summary and replay.
- **Difficulty:** Start with generous time, a short route, and a nearby destination. Later rounds may add a longer route, fewer open cells, or faster hazards, one change at a time.
- **Readability rules:** Source, destination, empty cells, occupied cells, energized wires, and shorts use distinct shapes as well as colors. The route to the exit and danger level stay visible throughout.
- **MVP content:** Standard and AND-gate board templates, a bounded scalable-board system, and three readable no-warning danmaku patterns from multiple directions. Add density slowly, preserve visible gaps, and tune for a short live demonstration. Additional enemy types are not needed to validate the core interaction.

## 5. Visual and Audio Design

### Visual direction

- **Style:** 2D, compact retro-futurist ship console with bold silhouettes and crisp, high-contrast shapes.
- **Palette:** Dark navy/charcoal background; cool cyan for safe power, distinct bright bullet colors/shapes for hostile patterns, and red/white flashes for shorts and hits. Never rely on color alone to communicate state.
- **Motion:** Animate current traveling along wires, the destination coming online, and the ship reacting to system failures. Keep effects brief so they do not obscure the grid.
- **Screen priority:** Board, ship danger, destination/system state, and recent chat actions should remain distinguishable at stream viewing size.

### Audio direction

- **Music:** A low-key sci-fi tension loop that can build slightly as danger rises; keep it unobtrusive under streamer commentary.
- **Sound effects:** Distinct, short cues for accepted placement, successful connection, short circuit, system recovery, and round outcome.
- **Accessibility and stream mix:** Pair every important sound with a visible cue. Provide independent music and effects volume controls if time permits.

## 6. UI and UX

- **Main menu / lobby:** Show the one-sentence objective, Twitch connection status, and a clear start/restart control. The prototype may use a simple title screen rather than a full menu.
- **Board HUD:** Label the power source and target; show grid coordinates or another easy-to-copy location format; display a concise command hint.
- **Ship HUD:** Keep system condition, danger meter, and exit progress visible without covering the board.
- **Chat feedback:** Show recent accepted commands and concise rejection reasons. Avoid flooding the screen with every chat message.
- **First-time comprehension:** Before the round, explain the loop in one sentence: “Pilot the ship; chat routes power to keep it alive.” Use a short visual example if needed.
- **Twitch connection:** Make connected, disconnected, and reconnecting states explicit. Provide a local/demo input path so the core loop can be evaluated without a live audience.
- **Accessibility:** Use shape, labels, and animation in addition to color; keep text large enough for a stream; avoid requiring fast typing from every viewer.

## 7. Technology and Tools

- **Target build:** A desktop game that can be captured cleanly in a Twitch stream.
- **Game engine and language:** Phaser + TypeScript with Vite for a browser-playable 2D prototype. Keep deterministic game rules and board generation independent from Phaser rendering and the Twitch adapter.
- **Twitch integration:** Use Twitch’s supported chat/event integration for incoming viewer commands and connection status. Keep game rules independent of the Twitch connection so local testing and demos remain possible.
- **Supporting tools:** Version control, a simple 2D asset workflow, and a shared task board. Keep the first build self-contained and avoid external services unless they are necessary for Twitch connectivity.
- **Technical constraints:** Handle bursts of chat input predictably, limit each viewer’s command rate, validate placements server-side/game-side before applying them, and keep a clear path to reset a round.

## 8. Timeline and Milestones

Relative milestones; exact dates depend on the hackathon schedule.

1. **Design lock:** Confirm the board-ID command grammar, active-chatter window and 100-chatters-per-board tier, board cap, single-board page navigation, board templates, replace-on-placement behavior, gate rule, short consequence, and Twitch input approach.
2. **Playable loop:** A local build supports Standard and AND-gate boards, pilot movement, replaceable wires, shorts, and round outcomes.
3. **Scalable boards and danmaku:** Chat activity and pilot hits can add numbered boards; one board is shown at a time; the near-square arena supports readable attacks from all sides; seeded layouts and patterns are repeatable.
4. **Twitch loop:** Viewers target boards by ID; connection state, rate limits, and chat feedback work in a live session.
5. **Polish and demo:** Tune pacing, improve visual/audio feedback, test at stream scale, and prepare a short demonstration/reset flow.

**Completion target:** A polished vertical slice with Standard and AND-gate board templates, scalable numbered boards, and one complete round loop, suitable for a live hackathon demo. Cut optional features before compromising input reliability or board readability.

## Design questions for prototyping

- What command format is easiest for viewers to understand and type quickly?
- How should multiple viewers replacing the same wire cell in quick succession be acknowledged and communicated?
- Do active-wire crossings create enjoyable tension, or do they make the board hard to read?
- Can a new viewer understand the goal and the result of a short within a few seconds?
