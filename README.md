# Hearth Workplace / Spatial Understanding for a Service Robot

A JavaScript + Three.js simulation of a two-floor office (12 rooms, 2 corridors and an enclosed stair hall). A service robot, MOMO, starts with no map. It explores with a simulated LiDAR and RGB-D camera, builds an occupancy map, recognises rooms and objects, and keeps a hierarchical semantic scene graph:

**House → Floor → Room → Functional zone → Furniture → Object → Part**

Five office workers and an office dog share the building. Each agent keeps its own memory.

> **November 12, workplace upgrade.** The household became an office on the same floor-plan grid. Architecture, furniture, sensing, mapping, semantics and the interface were rebuilt. The original task system, yielding behaviour and tests are kept. See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and [VALIDATION.md](VALIDATION.md) for test results. A copy of the pre-upgrade source is in `_backup-original-2026-11-12/`.

## Run locally

Use Node.js. There are no npm dependencies and no build step.

```text
node server.cjs
```

Open http://127.0.0.1:8088/ . Serve the page over HTTP rather than opening `index.html` directly. Three.js 0.170.0 loads from jsDelivr, so internet access is required. All textures are generated procedurally at start-up, so there are no asset downloads.

## Explore

* **Start patrol** begins autonomous exploration and facility tasks. MOMO collects litter, cleans floor spills, reads room sensor hubs, switches off lights in empty rooms, empties its bin at the recycling station and recharges at its dock.
* **View modes** (above the 3D view):
  * **Realistic 3D**: the observer's view of the true building.
  * **Robot camera**: MOMO's first-person RGB-D view.
  * **Semantic**: objects MOMO has recognised take their category colour, and floors show the room type MOMO inferred.
  * **Mapping**: MOMO's 0.25 m occupancy grid with frontiers, the live LiDAR sweep and depth points.
  * **Navigation**: the goal, the A* route, blocked cells, the robot footprint, the safety radius and the pose estimate.
  * **Scene graph**: click any object to see its relations drawn in 3D.
* **Floors**: Ground, Upper or Both (exploded). **Full-height walls** switches from the architectural section cut to closed rooms. **Colliders** overlays every physics box on the visual geometry. **Quality** offers High (ambient occlusion + 4K shadows), Balanced or Fast.
* **03 · MOMO's reconstructed office** shows a second 3D view built only from robot memory.
* **04 · Semantic scene graph** lets you browse the robot-belief tree or the ground-truth tree, filter it (for example "handle" or "pantry") and inspect any node: attributes, relations and an error against ground truth. It also shows the Level 1–4 summary.
* **Experiments**: move a chair, close a door, open all doors, add litter. Every change reaches MOMO's map only when its sensors observe it again.

## Validate

```text
node simulation-test.mjs      # 10 original behaviour checks
node interaction-test.mjs     # 3 original pedestrian / scan-view checks
node acceptance-test.mjs      # workplace acceptance scenarios A–F and H
```

## What is real and what is approximated

| Capability | Status |
| --- | --- |
| LiDAR + RGB-D sensing | Simulated by 3D ray casting against colliders, with range noise. MOMO never reads the floor plan. |
| Occupancy mapping, frontier exploration, A* with footprint sweep | Implemented. |
| Pose estimation | Odometry with noise plus correlative scan-to-map matching, reported and scored (mean ≈ 3 cm). The map is registered with the simulator pose, so this is **not full SLAM** and there is no loop closure. |
| Object detection | Oracle-labelled detector that needs line of sight, field of view and size-dependent range. It gives perfect categories and instance ids. There is no learned vision model. |
| Room and zone recognition, spatial relations | Inferred from observations (rules plus geometry). |
| Manipulation | Parts, joints and grasp points are modelled for future use. MOMO has no arm, so it cannot open doors or drawers. |
| People and the dog | Keep the original idealised cell-reveal perception. |

## Source

| File | Responsibility |
| --- | --- |
| `catalog.mjs` | Object types, dimensions, colliders, parts, affordances, office layout, windows |
| `world.mjs` | Architecture, doors, spatial hash, collision, ray casting, routing, stairs |
| `mapping.mjs` | LiDAR / depth simulation, occupancy grid, frontiers, localisation |
| `semantics.mjs` | Detection model, belief, room segmentation and recognition, zones, relations, scene graph, levels |
| `simulation.mjs` | Agents, tasks, exploration, navigation, yielding, experiments |
| `scene.mjs`, `furniture.mjs`, `materials.mjs` | Observer rendering and view modes |
| `robot-knowledge.mjs`, `robot-view.mjs` | Memory-only reconstruction |
| `app.mjs`, `index.html`, `style.css` | Interface |
