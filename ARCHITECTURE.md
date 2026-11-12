# Hearth Tower — architecture notes

Hearth started as a household robot simulation (two floors, twelve rooms, one robot, a family and pets). The workplace upgrade kept that engine, task system and tests and gave the robot a real perception → mapping → semantics pipeline. The Tower upgrade (12 Nov) replaced the 24 × 18 m two-floor plan with a parametric five-storey, 48 × 30 m office (`building.mjs`) and generalised every layer to N floors and several vertical links.

## Layers (kept separate on purpose)

| Layer | File | What it holds | Who may read it |
| --- | --- | --- | --- |
| Physical world (ground truth) | `building.mjs`, `world.mjs`, `catalog.mjs` | Metric walls, doors (with state), windows, 250+ objects with sizes, colliders, parts, affordances | Simulator, renderer, sensors (by ray casting), test scoring |
| Visual rendering | `scene.mjs`, `furniture.mjs`, `materials.mjs` | Three.js meshes built **from the same catalog data** | Observer only |
| Robot sensing & mapping | `mapping.mjs` | Simulated LiDAR + RGB-D, 0.25 m log-odds occupancy grid, pose estimate | Robot |
| Robot semantics | `semantics.mjs` | Detected objects, rooms, zones, relations, scene graph, levels 1–4 | Robot, UI |
| Robot memory projection | `robot-knowledge.mjs`, `robot-view.mjs` | 3D reconstruction from memory only | UI |
| Behaviour | `simulation.mjs` | Agents, tasks, exploration, navigation, yielding | — |

The robot never reads `world.blocked`, room names or object lists. It only receives ray-cast ranges, depth returns and detector outputs that need line of sight.

## Coordinates and units

* Metres throughout. World x = east (0–48), z = south (0–30), y = up. Five floors (f = 0…4, shown as L1–L5), floor-to-floor height 3.6 m, ceilings at 3.0 m.
* Navigation keeps the original 1 m grid (cell key `"x,z,floor"`). Collision, visibility and sensing use continuous 3D axis-aligned boxes.
* Object local frame: x = width, z = depth (front at +z), y = up from the base; `rot` is a multiple of 90° about y, applied exactly like `Object3D.rotation.y`.
* Persistent ids: anchor furniture keeps the historical ids `furniture-<floor>-<room>`; everything else is `<room-id>:<name>`; parts are `<object-id>:drawer-2:handle`.

## Architecture model

* Exterior walls 0.25 m, interior walls 0.12 m, 1.0 m door openings with frames, thresholds and hinged leaves (meeting rooms and the manager's office have glass doors).
* 19 windows with frames, mullions, glazing, interior sills and roller blinds.
* Baseboards, crown trim, room-specific floor finishes (carpet tiles, terrazzo, porcelain tile, oak, raised access floor, rubber), ceilings with light panels.
* Three glazed stair towers outside the façade (West and East serve L1–L5, the Feature stair only L1–L3). Each flight is U-shaped with 2 × 11 risers of 0.164 m and a half landing; agents follow the same 3D polyline the renderer draws (`flightPath`).
* A central lift core with two cars (`liftPath`): a lift ride can skip floors. Stairs and lifts are *links* between the landing cell on each served floor (`LINKS`, `LINK_AT`).
* Routing: A* over cells `"x,z,floor"`; a landing cell gains neighbours on the floors its link serves. Cost: 14 per stair flight, 8 + 3 per floor for a lift. An agent can only use links it has seen (their landings are landmarks).
* Occupancy: one person per stair flight, one rider per lift car, and arriving agents reserve the landing.
* Every solid object has collider boxes generated from its catalog entry. Tables have a top plus four legs, so the LiDAR sees under them and the depth camera sees the top, as on a real robot. Wall-mounted items above 1.0 m (upper cabinets, displays, mirrors) are not navigation obstacles.

## Robot pipeline

1. **Sensing** (`lidarScan`, `depthScan`): a 360-ray LiDAR at 0.18 m (12 m range), and a 105° × 7-row depth camera at 0.95 m (6.5 m). Returns inside the robot's height band (0.03–1.0 m) become a virtual scan (the ROS depth-to-laserscan approach). Range noise is seeded and reproducible.
2. **Pose**: wheel odometry with simulated noise plus correlative scan-to-map matching against the robot's own map. It uses mean surface points per cell to avoid grid bias, a coarse-to-fine search, a weak odometry prior, a capped correction and a gain threshold for corridor degeneracy. The estimate is reported and scored, but the map is registered with the simulator pose. `MAP_POSE.mode='estimate'` builds the map from the estimate; without loop closure it drifts along the 48 m corridors. **This is not full SLAM.**
3. **Mapping**: two log-odds layers (LiDAR, camera band) fused by max; cells are centred on multiples of 0.25 m so thin walls fall inside one cell. Frontiers are clustered 8-connected.
4. **Navigation**: the 1 m navigation memory is derived from the fine map. A* (binary heap) also rejects grid edges whose footprint sweep crosses an observed obstacle, so a swung door leaf or a chair is not "cut through". A near-field bumper (ground-truth swept test, like a physical bumper) catches anything not yet mapped. There is a recovery behaviour (back out along its own trajectory) and exponential back-off for unreachable tasks.
5. **Detection**: an object is detected only if sample points on it are in the camera frustum, within a size-dependent range and not occluded by 3D ray casts. The detector is oracle-labelled: it returns the true category and a persistent instance id. Confidence fuses per observation; negative evidence removes objects that should be visible but are gone.
6. **Semantics**: rooms are segmented from the robot's own free space, using detected door cells as separators. Fragments split by furniture are merged when they were co-visible from one viewpoint without looking through a doorway. Room types come from weighted object evidence plus corridor shape. Zones grow around anchor furniture. Relations are computed geometrically from observed boxes.
7. **Levels**: L1 rooms and door connectivity → L2 occupancy geometry, doors and windows → L3 objects → L4 parts, handles and grasp points. L4 detail is unlocked only for objects observed within 2.6 m with enough confidence, so fine detail is not generated uniformly.

## Scene graph

Hierarchy: `building → floor → room → zone → furniture → object → part` (e.g. *Building → Level 1 → Pantry → Countertop area → Base cabinets → Drawer → Drawer handle*).

Node attributes: id, category/type, position, orientation, bbox, collision, mobility (fixed/heavy/movable), static flag, interactive flag, affordances, confidence, observation count, first/last seen, visibility (`visible`, `occluded`, `remembered`, `expected-missing`), state (door open/closed), LOD.

Edges: `inside`/`contains`, `on_top_of`, `next_to` (gap < 0.45 m), `connected_to` (room ↔ door ↔ room), `accessible_from` (open doors; furniture reachable from a known free cell), `behind` (seen from the room entrance), `obstructed_by` (closed door, or something in front of an interactive face), `part_of`.

`groundTruthGraph(world)` builds the same hierarchy from the floor plan for comparison only.

## Integration path (Isaac Sim / ROS 2)

* The catalog already holds metric sizes, collider boxes, joints (`prismatic`/`revolute`, axis, limits) and grasp poses. Each entry maps to a USD prim with a `UsdPhysics` collider and articulation joints, or to a URDF/SDF link.
* `lidarScan` matches `sensor_msgs/LaserScan`; `depthScan` points match `sensor_msgs/PointCloud2`; the occupancy grid maps to `nav_msgs/OccupancyGrid` (resolution 0.25, origin −0.125, −0.125).
* The scene graph JSON (`sim.graph`) is the natural payload for a semantic map topic or a 3D scene-graph library (e.g. Hydra-style layers).
* To swap in a real SLAM back-end, replace `robotPerceive` with a node that subscribes to the robot's map and pose. Everything downstream consumes only `robot.map`, `robot.memory` and the detections.
