# Hearth Tower / demonstration script（演示脚本）

1. **Unknown office / 未知办公楼 (20 s)**: Reset. Show *All (exploded)* to present the five floors, three stair towers and the lift core, then L1. Show Realistic 3D, then Semantic: everything is ghosted because MOMO knows nothing yet. 重置后先看真实视图，再切到语义视图：一切都是半透明的，因为 MOMO 还一无所知。
2. **Sense and map / 感知与建图 (40 s)**: Start at 4×. Switch to Mapping: the LiDAR sweep (red), depth points (green), frontiers (amber) and the grid filling in. Switch to Robot camera to show what the sensor sees. 4 倍速开始，切到建图视图，再切到机器人相机视图。
3. **Rooms and objects / 房间与物体识别 (40 s)**: Back to Semantic: rooms are coloured as soon as MOMO recognises them, with a confidence label. In section 04, filter "pantry", open *Countertop area → base cabinets → Drawer → Drawer handle* and show the grasp point and reachability. 语义视图中房间被识别后着色；在 04 区展开到抽屉把手。
4. **Relations / 空间关系 (20 s)**: Scene-graph mode, click the boardroom table: *on top of*, *next to*, *behind*, *accessible from* are drawn in 3D. 场景图模式下点击会议桌，显示关系连线。
5. **Floors / 跨楼层 (30 s)**: Follow MOMO in Navigation view when it heads for a stair or lift: the status reads *Climbing the east stair to L2* or *Riding Lift 1 to L4*, the camera floor tab follows, and section 05 marks every landing. Point out that the Feature stair stops at L3. 观察 MOMO 选择楼梯或电梯跨层，注意中庭楼梯只到 L3。
6. **Navigation / 导航 (20 s)**: Navigation view: goal, A* route, blocked cells, footprint and safety radius, the pose estimate ring, and people stopping for MOMO. 导航视图：目标、路径、阻塞格、安全半径、位姿估计。
7. **Change / 动态变化 (30 s)**: Experiments → *Close a door*. When MOMO sees it, the feed says "marked as a temporarily blocked doorway, not a wall" and the room gets an `obstructed_by` relation. *Move a chair*: the belief pose updates after it is observed again. 关门、挪椅子，观察地图和场景图如何更新。
8. **Honesty slide / 真实与近似**: open "What is real vs. approximated" in the sidebar. 展示侧栏中的"真实与近似"说明。

Use **Screenshot** or **Record 12 s** for slides. The scan reconstruction (03) and the collider overlay are good evidence images. 用截图或 12 秒录屏制作幻灯片。
