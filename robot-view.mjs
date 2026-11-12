// MOMO's own 3D reconstruction. Built only from robot memory: the 0.25 m occupancy grid (with
// observed obstacle heights), the 1 m navigation memory, detected object boxes from the semantic
// belief and recent sightings. Unobserved space is not drawn.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {robotObservation} from './robot-knowledge.mjs?v=20261112v';
import {RES,NX,NZ} from './mapping.mjs?v=20261112v';
import {W,D,FLOORS} from './world.mjs?v=20261112v';
const GAP=5;
import {CATEGORY_COLOURS,ROOM_COLOURS} from './materials.mjs?v=20261112v';

export function createRobotView(container,sim){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#14302a');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(43,1,.1,260);camera.position.set(W/2+26,40,D/2+44);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(W/2,0,D/2);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=5;controls.maxDistance=160;
 scene.add(new THREE.HemisphereLight('#e7fff1','#37544c',2.2));const light=new THREE.DirectionalLight('#fff5d8',1.8);light.position.set(5,18,9);scene.add(light);
 const unit=new THREE.BoxGeometry(1,1,1),mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85});
 const freeTiles=new THREE.InstancedMesh(unit,mat,NX*NZ*FLOORS),walls=new THREE.InstancedMesh(unit,mat,NX*NZ*FLOORS);for(const m of [freeTiles,walls]){m.count=0;m.frustumCulled=false;scene.add(m);}
 const boxes=new THREE.Group(),labels=new THREE.Group();scene.add(boxes,labels);
 const sightings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.25,1.2,12),new THREE.MeshStandardMaterial({color:'#e8bc94',transparent:true,opacity:.8}),100);sightings.count=0;sightings.frustumCulled=false;scene.add(sightings);
 const markers=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.16),new THREE.MeshBasicMaterial({color:'#e6bc76'}),400);markers.count=0;markers.frustumCulled=false;scene.add(markers);
 const robot=new THREE.Group(),body=new THREE.Mesh(new THREE.CylinderGeometry(.34,.38,.3,24),new THREE.MeshStandardMaterial({color:'#dcf6e5',emissive:'#216f56',emissiveIntensity:.4}));body.position.y=.18;robot.add(body);
 robot.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,.1,0),1.35,'#69ebc3',.3,.18));scene.add(robot);
 const fov=new THREE.Mesh(new THREE.CircleGeometry(6.5,40,-52.5*Math.PI/180,105*Math.PI/180),new THREE.MeshBasicMaterial({color:'#69ebc3',transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));fov.rotation.x=-Math.PI/2;fov.position.y=.05;robot.add(fov);
 const matrix=new THREE.Matrix4(),color=new THREE.Color(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scl=new THREE.Vector3();
 const put=(mesh,i,x,y,z,w,h,d,c)=>{pos.set(x,y,z);scl.set(w,h,d);matrix.compose(pos,quat,scl);mesh.setMatrixAt(i,matrix);if(c)mesh.setColorAt(i,color.set(c));};
 function tag(text,c){const cv=document.createElement('canvas'),ctx=cv.getContext('2d');ctx.font='600 28px sans-serif';const w=Math.ceil(ctx.measureText(text).width)+28;cv.width=w;cv.height=44;ctx.font='600 28px sans-serif';ctx.fillStyle=c;ctx.globalAlpha=.85;ctx.beginPath();ctx.roundRect(0,0,w,44,20);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#10241f';ctx.textBaseline='middle';ctx.fillText(text,14,23);const t=new THREE.CanvasTexture(cv);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false}));s.scale.set(w/44*.55,.55,1);return s;}
 const clear=g=>{for(const o of [...g.children]){g.remove(o);o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();}};
 let selectedFloor='follow',follow=true,lastScan=-1,lastRobot=null,lastGraph=-1,state={cells:[],occupants:[],landmarks:[],floor:0};
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(container);resize();
 function rebuild(sel){const a=sim.robot,map=a.map,floors=sel==='all'?[...Array(FLOORS).keys()]:[sel],yo=f=>sel==='all'?f*GAP:0;state=robotObservation(a,sim.time,floors[0]);state.floor=sel;const obs=floors.map(f=>robotObservation(a,sim.time,f));let n=0,b=0;
  for(const f of floors)for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){const i=iz*NX+ix,s=map.state(f,i);if(!s)continue;const x=ix*RES,z=iz*RES,recent=sim.time-map.time[f][i]<.6;
   if(s===1)put(freeTiles,n++,x,yo(f)-.03,z,RES*.96,.04,RES*.96,recent?'#56c5a1':'#7f9d90');else{const h=Math.max(.25,map.hitH[f][i]||.3);put(walls,b++,x,yo(f)+h/2,z,RES*.94,h,RES*.94,recent?'#b8e3cf':'#5f7c71');}}
  freeTiles.count=n;walls.count=b;for(const m of [freeTiles,walls]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  const lm=obs.flatMap(o=>o.landmarks),occ=obs.flatMap(o=>o.occupants);markers.count=Math.min(400,lm.length);lm.slice(0,400).forEach((p,i)=>put(markers,i,p.ox??p.x,yo(p.f)+1.2,p.oz??p.z,1,1,1));markers.instanceMatrix.needsUpdate=true;
  sightings.count=Math.min(100,occ.length);occ.slice(0,100).forEach((p,i)=>put(sightings,i,p.x,yo(p.f)+.6,p.z,1,p.type==='human'?1:.5,1));sightings.instanceMatrix.needsUpdate=true;
  const empty=container.querySelector('#scan-empty');if(empty){empty.style.display=n?'none':'block';empty.textContent=sim.time?'No scans on this floor yet.':'Start the patrol to reveal MOMO\'s first scan.';}
  const readout=document.getElementById('scan-readout');if(readout)readout.textContent=`${sel==='all'?'Whole building':`Level ${sel+1}`} · ${(n*RES*RES).toFixed(0)} m² free · ${b} obstacle cells · ${[...a.belief.objects.values()].filter(o=>floors.includes(o.f)&&o.present!==false).length} objects`;}
 function rebuildObjects(sel){clear(boxes);clear(labels);const belief=sim.robot.belief,floors=sel==='all'?[...Array(FLOORS).keys()]:[sel],yo=f=>sel==='all'?f*GAP:0;
  for(const o of belief.objects.values()){if(!floors.includes(o.f)||o.present===false||!o.bbox||o.type==='rug')continue;const b=o.bbox,w=b.x1-b.x0,h=Math.max(.02,b.y1-b.y0),d=b.z1-b.z0;const c=CATEGORY_COLOURS[o.category]??'#cccccc';
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:c,transparent:true,opacity:.35+.6*o.conf}));edges.position.set((b.x0+b.x1)/2,yo(o.f)+(b.y0+b.y1)/2,(b.z0+b.z1)/2);boxes.add(edges);
   if(o.partsUnlocked)for(const p of o.parts??[])for(const ch of p.children??[])if(ch.grasp?.p){const m=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),new THREE.MeshBasicMaterial({color:'#ffd166'}));const g=ch.grasp.p,cs=Math.cos(o.pose.rot),sn=Math.sin(o.pose.rot);m.position.set(o.pose.x+g[0]*cs+g[2]*sn,(o.pose.y??0)+g[1],o.pose.z-g[0]*sn+g[2]*cs);boxes.add(m);}}
  for(const r of belief.regions.values()){if(!floors.includes(r.f)||r.label==='unknown')continue;const ps=r.cells.map(c=>c.split(',').map(Number));const t=tag(`${r.name} ${Math.round(r.confidence*100)}%`,ROOM_COLOURS[r.label]??'#ccc');t.position.set(ps.reduce((s,p)=>s+p[0],0)/ps.length,2.2,ps.reduce((s,p)=>s+p[1],0)/ps.length);labels.add(t);}}
 function update(){const a=sim.robot,f=selectedFloor==='follow'?a.f:selectedFloor==='all'?'all':Number(selectedFloor),floorChanged=state.floor!==f;
  if(sim.lastSense!==lastScan||lastRobot!==a||floorChanged){rebuild(f);lastScan=sim.lastSense;lastRobot=a;}
  if(sim.graphTime!==lastGraph||floorChanged){rebuildObjects(f);lastGraph=sim.graphTime;}
  const est=a.localizer?.est??a;robot.visible=(f==='all'||a.f===f)&&!a.stair;robot.position.set(est.x,f==='all'?a.f*GAP:0,est.z);robot.rotation.y=-(est.heading??a.heading);
  const target=f==='all'?new THREE.Vector3(W/2,GAP*(FLOORS-1)/2,D/2):follow&&a.f===f?new THREE.Vector3(est.x,0,est.z):new THREE.Vector3(W/2,0,D/2);if(follow||floorChanged){const delta=target.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(target);}
  controls.update();renderer.render(scene,camera);}
 return {update,renderer,get state(){return state;},setFloor(v){selectedFloor=v;lastScan=-1;lastGraph=-1;},setFollow(v){follow=v;},dispose(){observer.disconnect();controls.dispose();clear(boxes);clear(labels);scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});renderer.dispose();renderer.domElement.remove();}};
}
