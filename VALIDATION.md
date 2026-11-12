# Validation / 2026-11-12 workplace upgrade

All numbers come from runs of the current code. The simulation is deterministic: the sensor noise is seeded.

## Regression: original suites

* `node simulation-test.mjs`: **10 / 10 pass.** These cover independent finite knowledge, cone/range/occlusion, unseen-task refusal, occupied-room lights, litter collection and disposal, furniture-change detection, continuous stairs, 20-minute normal and 4× runs, visitors and reset. In the long run the minimum robot centre distance was 1.050 m and the minimum person-to-person distance was 0.720 m. The robot reached the upper floor.
* `node interaction-test.mjs`: **3 / 3 pass** (stationary pedestrian with shoulder pass at 1× and 4×, scanned-only reconstruction).

## Acceptance scenarios (`node acceptance-test.mjs`)

| Test | Result |
| --- | --- |
| **A Initial exploration** | Starts with an empty map, no objects and only the dock landmark. Coverage after 60 s: 19 %. Over 20 minutes: 19 → 35 → 42 → 62 → 69 → 81 → 94 → **96 %**. Every remembered cell lies within sensor range of the robot's own path. |
| **B Room recognition** | **14 / 14 regions labelled correctly**: 2 corridors, 2 open workspaces, boardroom, meeting room, pantry, print room, reception, lounge, private office, server room, restroom, wellness room. Labels come only from observed objects and region shape. |
| **C Stable identifiers** | 243 objects in the belief, 0 duplicates, unique scene-graph ids. First-seen times never change. 95th-percentile position error 0.00 m (detector uses true poses). Handle chain: house › floor › room › furniture › object › part. |
| **D Navigation** | 12 / 12 rooms routable from the corridor on MOMO's own map. Every route edge is collision-free in the true geometry. A driven test trip to the pantry arrived without clearance violations. |
| **E Dynamic changes** | A moved chair updates its belief pose within a few scans and is logged. A closed door turns the doorway cell blocked **and tagged as a door** (not a wall), creates an `obstructed_by` relation and removes the doorway from plans. Reopening restores it. |
| **F Geometric consistency** | Collider unions match every object footprint (±2 cm). All parts lie on their bodies. Supported objects rest on their support surfaces. Of 2,239 occupied map cells, **0** are unexplained by real geometry. |
| **H Performance (simulation)** | 21 ms CPU per simulated second including every agent. Robot sensing 3.3 ms per scan at 5 Hz. Scene-graph rebuild 7 ms per second (514 nodes, 1,224 edges). Pose error mean 3.2 cm, max 0.40 m. 46 tasks completed and 95.5 % coverage in 20 minutes. |

## Browser checks (Test G and the rendering half of H)

Headless Chrome 153 with SwiftShader (software WebGL), 1500 × 1150:

* All six view modes switch without page errors. Each viewer keeps exactly one canvas, including after Reset. There is no horizontal overflow.
* The mapping texture is aligned with the building and tinted with the same room colours as the semantic view.
* The collider overlay coincides with the visual furniture and walls.
* Robot camera mode shows the HUD and the live detections.
* Scene-graph filter and inspector work ("handle" → 63 leaves → *Lever handle*). Close-door and reset work.

| Renderer (ground floor, same camera) | Draw calls | Triangles | CPU-rendered frame |
| --- | --- | --- | --- |
| Original household scene | 1,199 | 56 k | 10.1 ms |
| Workplace, Balanced | 381–476 | 142 k | 8.5 ms |
| Workplace, both floors, Balanced | 780 | 269 k | 19.2 ms |
| Workplace, High (GTAO + 4K shadows) | — | — | 70 ms |

Static geometry is merged per material, which cuts draw calls by about 2.5× despite far more detail. Small objects are distance-culled, and the AO pre-pass honours the section cut. These are software-rendering times, so they rank the settings but do not predict GPU frame rates. **A real-GPU frame-rate measurement is still to be done.**

## Known limitations

* Mapping uses known poses. The pose estimator is evaluated, not used for mapping (switch: `MAP_POSE.mode='estimate'`). Without loop closure it drifts in the long corridor.
* The detector is oracle-labelled, and object poses are exact once seen.
* Room segmentation can briefly split a room until co-visibility merges the fragments. Small furniture pockets can stay unreached.
* People and the dog are point agents with a clearance radius, so bodies can visually brush furniture.
* In the exploded two-floor view, the stair geometry keeps true height (3 m) while the upper floor is displayed 9 m up, joined by a dashed link. Ambient occlusion is off in that view.
* Doors cannot be opened by MOMO, because it has no manipulator.
