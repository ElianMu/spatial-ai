# Final-submission requirements → where they are met

Spatial AI, Columbia GSAPP Fall 2026 (A6596-1). Each row names the brief's requirement, where the code implements it, how to show it in the app, and the automated check (`node designer-test.mjs`, `node simulation-test.mjs`, `node interaction-test.mjs`, `node acceptance-test.mjs`).

| Requirement | Implementation | Show it in the app | Evidence |
| --- | --- | --- | --- |
| Baseline simulation from a semantic model | `SEMANTIC_MODEL.md`; `building.mjs` + `env.mjs` `defaultGenome()` | Open the page: the **Model** workspace shows the whole building running the baseline | Acceptance A–H |
| ≥ 2 notions of location; a location relative to each frame | `metrics.mjs` `frames()`: world, grid, topological, landmark (dock), belief, geographic | Right panel → *Where it is, in six frames* (pick any agent in the selector) | designer-test "Six frames…" |
| ≥ 2 notions of distance, each with its own metric | `metrics.mjs` `distances()`: Euclidean (m), grid (cells + floors), geodesic (m), travel time (s), topological (hops) | Right panel → *How far to its goal* | designer-test "Six frames…" |
| ≥ 2 kinds of spatial agents | Robot, people, dog (`simulation.mjs`) | Agent selector at the top of the right panel; the teal pin marks the selected agent | simulation-test |
| Limited knowledge, but they scan | Empty memories; cones, ranges, occlusion; scan turns | **Plans** workspace → *One agent*; vision cones in the Model | simulation-test "Limited initial knowledge", "Finite cone…" |
| Spatial memory: landmarks reused for later decisions | Landmarks (dock, hubs, recycling, landings, lift lobbies, rooms); reuse counter; wayfinding signs | Right panel → *Landmarks reused*; **Plans** → *Recent landmarks* | simulation-test long run (`reuse > 0`) |
| ≥ 1 goal per agent | Robot: facility tasks; staff: reach destinations; dog: find a resting spot | Status line, to-do list | Long runs |
| Measurable performance per goal type | `Simulation.performance()` | Right panel → *How well everyone is doing* (score breakdown + one table per goal); score in the top bar | designer-test "Headless evaluation…" |
| Planning ahead with limited knowledge | A* on each agent's own memory, with region costs and known stairs and lifts; frontier exploration | *Navigation* view: goal, route, blocked cells | Acceptance D, designer-test "Planners avoid…" |
| Physical environment | Metric 3D building, colliders, ray-cast sensors | **Model** (six view modes) | Acceptance F |
| Partial observability | Sensors with range, field of view and occlusion; unknown floors | *Mapping* view; *Robot camera* | Acceptance A |
| Multi-agent | 12 agents by default, shared stairs and lifts, yielding | Whole-building view | Interaction tests |
| Dynamic (choice) | Doors, moved furniture, new litter, spills, the moving sun | Right panel → *Change the building now*; *Activity* feed | Acceptance E |
| Deterministic or not (choice) | Stochastic with a seed (reproducible) | Event feed shows *Environment* events | designer-test "Stochastic … seeded" |
| Obstacles | Walls, furniture, closed doors, out-of-service links | Red barriers on links, closed doors | designer-test "Genome controls…" |
| Hindrances and affordances | `env.mjs` `ZONE_KINDS`: wet floor, crowd, works, glare / fast lane, charging strip, wayfinding | Coloured floor regions in the Model; legend in **Designer** | designer-test "Hindrances slow…", "Wayfinding…" |
| **Primary: generate multiple environment options** | `env.mjs` genome + `mutate()`; `evaluate.mjs`; `evolve-worker.mjs`; `designer.mjs` | **Designer** workspace | designer-test |
| Manual: two simulations side by side, pick one, breed two more | `designer.mjs` choose-your-own-adventure | **Designer** → *Compare two, pick one* → *Generate two options* → *Keep A / Keep B*; changes are ringed in orange; *Your choices so far* | Browser check |
| Automated: generate → aggregate performance → modify → repeat for N epochs | `designer.mjs` `evolve()` (1 + λ) | **Designer** → *Evolve over epochs* → set *Epochs* → *Evolve* (each variant scored on two seeds); chart, log, *Export run (JSON)* | Browser check |
| **Secondary: real-world data, real time or historic** | `realworld.mjs` (Open-Meteo forecast and ERA5 archive) + `mcp/site-data-server.mjs` | **Site & time** → *Jump to now* (real time) or pick a past date → *Load weather for this date* | designer-test "True sun position…", "Sun drives…" |
| A real place in 3D + time | Avery Hall coordinates, 28.9° grid rotation, sun vector in 3D, hourly time series | 3D sun and shadows move with the site clock; geographic frame per agent | designer-test |

## Deliverables (slide deck)

| Item | Status |
| --- | --- |
| 1. URL to the simulation | GitHub Pages: `https://elianmu.github.io/spatial-ai/` (after pushing and enabling Pages) |
| 2. Semantic model markdown | `SEMANTIC_MODEL.md` (with Mermaid diagrams, rendered by GitHub) |
| 3. Diagrams for each requirement | Mermaid diagrams in `SEMANTIC_MODEL.md` + screenshots from the app (*Screenshot* button) |
| 4. Instruction-manual video | Record by following `DEMO.md` (uses *Record 12 s* or screen recording) |
| 5. Demo video | Record a manual round and an evolution run in **Designer** |
| 6. Interesting environments + agent behaviour | Use **Designer** → *Export run (JSON)* and screenshots of the best plans; `DEMO.md` lists what to show |
