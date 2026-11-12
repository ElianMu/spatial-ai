# Hearth Tower / Spatial Understanding for a Service Robot

A JavaScript + Three.js simulation of a **five-storey, 48 × 30 m office building** (70 rooms on a racetrack corridor plan, 3 stair cores and 2 lifts). A service robot, MOMO, starts with no map. It explores with a simulated LiDAR and RGB-D camera, builds an occupancy map per floor, recognises rooms and objects, discovers stairs and lifts as landmarks, and keeps a hierarchical semantic scene graph:

**Building → Floor → Room → Functional zone → Furniture → Object → Part**

Ten staff members (two per floor) and an office dog share the building. Each agent keeps its own memory.

## The building

| | |
| --- | --- |
| Footprint | 48 × 30 m, 5 floors (L1–L5), 3.6 m floor-to-floor, 3.0 m ceilings |
| Plan | North and south perimeter rooms, two 3 m corridors, a central band of rooms and four open cross passages that join the corridors into a loop, so most trips have more than one route |
| Rooms | 70 rooms: 10 open workspaces, 11 meeting rooms, 12 private offices, 7 pantries / cafés, 7 print rooms, 10 restrooms, 6 lounges, 4 wellness rooms, 2 server rooms and the main lobby (programme differs per floor) |
| Vertical circulation | **West stair** (L1–L5), **East stair** (L1–L5), **Feature stair** (L1–L3 only) in glazed towers outside the façade; **Lift 1** and **Lift 2** in a central core serving every floor |
| Contents | ≈1,900 objects (114 workstations, 311 chairs, cabinets, appliances, racks…), 86 doors, 127 windows, all with colliders, parts and affordances |

The floor plan, the room programme for each floor and the furnishing rules live in `building.mjs`. Furniture is laid out procedurally per room type, then every room is checked so that its service points (litter, spills, sensor hub, anchor furniture) are reachable from its own door.

A stair carries one person per flight and goes one floor at a time; a lift carries one rider but can skip floors, so planners trade walking for waiting. The feature stair stops at L3, so a trip to L5 that only knows that stair has no route.

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
* **Floors**: L1–L5, or All (exploded). **Full-height walls** switches from the architectural section cut to closed rooms. **Colliders** overlays every physics box on the visual geometry. **Quality** offers High (ambient occlusion + 4K shadows), Balanced or Fast.
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
| `catalog.mjs` | Object types, dimensions, colliders, parts, affordances |
| `building.mjs` | Floor plan, per-floor room programme, procedural furnishing, windows, stairs and lifts |
| `world.mjs` | Walls, doors, spatial hash, collision, ray casting, multi-floor routing, stair / lift traversal |
| `mapping.mjs` | LiDAR / depth simulation, occupancy grid, frontiers, localisation |
| `semantics.mjs` | Detection model, belief, room segmentation and recognition, zones, relations, scene graph, levels |
| `simulation.mjs` | Agents, tasks, exploration, navigation, yielding, experiments |
| `scene.mjs`, `furniture.mjs`, `materials.mjs` | Observer rendering and view modes |
| `robot-knowledge.mjs`, `robot-view.mjs` | Memory-only reconstruction |
| `app.mjs`, `index.html`, `style.css` | Interface |
