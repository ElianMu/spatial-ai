# Final-submission requirements → where they are met

Spatial AI, Columbia GSAPP Fall 2026 (A6596-1). Each row names the brief's requirement, where the code implements it, how to show it in the app, and the automated check (`node designer-test.mjs`, `node simulation-test.mjs`, `node interaction-test.mjs`, `node acceptance-test.mjs`).

| Requirement | Implementation | Show it in the app | Evidence |
| --- | --- | --- | --- |
| Baseline simulation from a semantic model | `SEMANTIC_MODEL.md`; `building.mjs` + `env.mjs` `defaultGenome()` | Open the page: the default **Whole building** view runs the baseline | Acceptance A–H |
| ≥ 2 notions of location; a location relative to each frame | `metrics.mjs` `frames()`: world, grid, topological, landmark (dock), belief, geographic | Agent card → *Location in six frames of reference* (pick any agent) | designer-test "Six frames…" |
| ≥ 2 notions of distance, each with its own metric | `metrics.mjs` `distances()`: Euclidean (m), grid (cells + floors), geodesic (m), travel time (s), topological (hops) | Agent card → *Distance to goal in five metrics* | designer-test "Six frames…" |
| ≥ 2 kinds of spatial agents | Robot, people, dog (`simulation.mjs`) | *Observe* menu | simulation-test |
| Limited knowledge, but they scan | Empty memories; cones, ranges, occlusion; scan turns | Knowledge map (05) → individual memory; vision cones | simulation-test "Limited initial knowledge", "Finite cone…" |
| Spatial memory: landmarks reused for later decisions | Landmarks (dock, hubs, recycling, landings, lift lobbies, rooms); reuse counter; wayfinding signs | Agent card → *Landmarks reused*; landmark list (05) | simulation-test long run (`reuse > 0`) |
| ≥ 1 goal per agent | Robot: facility tasks; staff: reach destinations; dog: find a resting spot | Status line, to-do list | Long runs |
| Measurable performance per goal type | `Simulation.performance()` | Sidebar → *Goals & performance*; metric bar → *Environment score* | designer-test "Headless evaluation…" |
| Planning ahead with limited knowledge | A* on each agent's own memory, with region costs and known stairs and lifts; frontier exploration | *Navigation* view: goal, route, blocked cells | Acceptance D, designer-test "Planners avoid…" |
| Physical environment | Metric 3D building, colliders, ray-cast sensors | All views | Acceptance F |
| Partial observability | Sensors with range, field of view and occlusion; unknown floors | *Mapping* view; *Robot camera* | Acceptance A |
| Multi-agent | 12 agents by default, shared stairs and lifts, yielding | Whole-building view | Interaction tests |
| Dynamic (choice) | Doors, moved furniture, new litter, spills, the moving sun | Experiments panel; event feed | Acceptance E |
| Deterministic or not (choice) | Stochastic with a seed (reproducible) | Event feed shows *Environment* events | designer-test "Stochastic … seeded" |
| Obstacles | Walls, furniture, closed doors, out-of-service links | Red barriers on links, closed doors | designer-test "Genome controls…" |
| Hindrances and affordances | `env.mjs` `ZONE_KINDS`: wet floor, crowd, works, glare / fast lane, charging strip, wayfinding | Coloured floor regions (legend in 06) | designer-test "Hindrances slow…", "Wayfinding…" |
| **Primary: generate multiple environment options** | `env.mjs` genome + `mutate()`; `evaluate.mjs`; `evolve-worker.mjs`; `designer.mjs` | Section 06 | designer-test |
| Manual: two simulations side by side, pick one, breed two more | `designer.mjs` choose-your-own-adventure | 06 A → *Generate two options* → *Choose A/B*; lineage list | Browser check |
| Automated: generate → aggregate performance → modify → repeat for N epochs | `designer.mjs` `evolve()` (1 + λ) | 06 B → set *Epochs* → *Evolve*; chart and log; *Export run (JSON)* | Browser check |
| **Secondary: real-world data, real time or historic** | `realworld.mjs` (Open-Meteo forecast and ERA5 archive) + `mcp/site-data-server.mjs` | Section 07 → *Now* (real time) or pick a past date → *Load weather* | designer-test "True sun position…", "Sun drives…" |
| A real place in 3D + time | Avery Hall coordinates, 28.9° grid rotation, sun vector in 3D, hourly time series | 3D sun and shadows move with the site clock; geographic frame per agent | designer-test |

## Deliverables (slide deck)

| Item | Status |
| --- | --- |
| 1. URL to the simulation | GitHub Pages: `https://elianmu.github.io/spatial-ai/` (after pushing and enabling Pages) |
| 2. Semantic model markdown | `SEMANTIC_MODEL.md` (with Mermaid diagrams, rendered by GitHub) |
| 3. Diagrams for each requirement | Mermaid diagrams in `SEMANTIC_MODEL.md` + screenshots from the app (*Screenshot* button) |
| 4. Instruction-manual video | Record by following `DEMO.md` (uses *Record 12 s* or screen recording) |
| 5. Demo video | Record a manual round and an evolution run (06) |
| 6. Interesting environments + agent behaviour | Use 06 → *Export run (JSON)* and screenshots of the best plans; `DEMO.md` lists what to show |
