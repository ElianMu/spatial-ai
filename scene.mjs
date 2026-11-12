// Observer renderer: high-fidelity office building plus the robot-understanding view modes
// (realistic, robot POV, semantic, mapping, navigation, scene graph). Geometry comes from the
// same world/catalog data as the simulation; nothing here influences what the robot knows.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {W,D,H,FLOORS,CEILING,LINKS,key,linkById} from './world.mjs?v=20261112v';
import {CORE,ENTRANCE,stairLocal} from './building.mjs?v=20261112v';
import {ZONE_KINDS} from './env.mjs?v=20261112v';
import {TYPES} from './catalog.mjs?v=20261112v';
import {RES,NX,NZ} from './mapping.mjs?v=20261112v';
import {createMaterials,FLOOR_FINISH,CATEGORY_COLOURS,ROOM_COLOURS} from './materials.mjs?v=20261112v';
import {Kit,buildObject,metricUV} from './furniture.mjs?v=20261112v';

const EXPLODE=8.5,CUT=1.3,CX=W/2,CZ=D/2;
export function createScene(container,sim,onSelect,onPick=()=>{}){
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.localClippingEnabled=true;container.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e9ece6');scene.fog=new THREE.Fog('#e9ece6',150,340);
 const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.55;
 const camera=new THREE.PerspectiveCamera(38,1,.05,700);camera.position.set(CX+34,40,CZ+50);
 const pov=new THREE.PerspectiveCamera(70,1,.05,60);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(CX,1.5,CZ);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.495;controls.minDistance=3;controls.maxDistance=240;
 const M=createMaterials(renderer.capabilities.getMaxAnisotropy());

 // Lighting: sky + sun with soft shadows; warm interior lights driven by the simulation's room light state.
 const hemi=new THREE.HemisphereLight('#fdfbf5','#b8b2a5',.75);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff1dc',2.6);sun.position.set(CX-26,46,CZ+40);sun.target.position.set(CX,0,CZ);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:5,far:160});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;scene.add(sun,sun.target);

 // ---------------------------------------------------------------- architecture ---
 const floorGroups=Array.from({length:FLOORS},(_,f)=>{const g=new THREE.Group();g.name=`floor-${f}`;scene.add(g);return g;});
 const archMats=Array.from({length:FLOORS},()=>{const clip=new THREE.Plane(new THREE.Vector3(0,-1,0),CUT);const c=(m)=>{const x=m.clone();x.clippingPlanes=[clip];x.clipShadows=true;return x;};return {clip,wall:c(M.wallPaint),accent:c(M.wallAccent),trim:c(M.trim),frame:c(M.frame),door:c(M.doorWood),glass:c(M.glass),wframe:c(M.windowFrame),blind:c(M.blind),handle:c(M.chrome),glassDoor:c(M.glass)};});
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#d9ddd2',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.32;ground.receiveShadow=true;scene.add(ground);
 const site=new Kit();site.boxMM(-6,W+6,-.33,-.3,-4,D+8,M.concrete);site.boxMM(ENTRANCE.x-2.5,ENTRANCE.x+2.5,-.3,-.02,D+.12,D+4,M.terrazzo);scene.add(site.build({cast:false}));
 const ceilings=[],capGroups=[],lights=new Map(),roomFloors=new Map(),archMeshes=[];
 const windowsBySide=(f,side)=>sim.world.windows.filter(w=>w.f===f&&w.side===side);
 for(let f=0;f<FLOORS;f++){
  const g=floorGroups[f],A=archMats[f],k=new Kit(),kt=new Kit(),caps=new Kit();
  k.boxMM(-.125,W+.125,-.3,0,-.125,D+.125,M.concrete);
  for(const r of sim.world.rooms.filter(r=>r.f===f)){const b=r.bounds,fin=M[FLOOR_FINISH[r.type]??'oak'];const mesh=new THREE.Mesh(metricUV(new THREE.BoxGeometry(b.x1-b.x0,.01,b.z1-b.z0)),fin);mesh.position.set((b.x0+b.x1)/2,.005,(b.z0+b.z1)/2);mesh.receiveShadow=true;g.add(mesh);roomFloors.set(r.id,mesh);mesh.userData.room=r.id;
   const ceil=new THREE.Mesh(new THREE.PlaneGeometry(b.x1-b.x0,b.z1-b.z0),M.ceiling);ceil.rotation.x=Math.PI/2;ceil.position.set((b.x0+b.x1)/2,CEILING,(b.z0+b.z1)/2);ceil.castShadow=false;g.add(ceil);ceilings.push(ceil);
   const lk=new Kit();const nx=Math.max(1,Math.round((b.x1-b.x0)/2.6)),nz=Math.max(1,Math.round((b.z1-b.z0)/2.4));for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)lk.boxMM(b.x0+(i+.5)*(b.x1-b.x0)/nx-.3,b.x0+(i+.5)*(b.x1-b.x0)/nx+.3,CEILING-.012,CEILING-.002,b.z0+(j+.5)*(b.z1-b.z0)/nz-.3,b.z0+(j+.5)*(b.z1-b.z0)/nz+.3,M.lightPanel);const lp=lk.build({cast:false});g.add(lp);ceilings.push(lp);
   const span=Math.hypot(b.x1-b.x0,b.z1-b.z0),light=new THREE.PointLight('#ffdcb0',r.kind==='corridor'?9:14,Math.max(9,span*.75),1.6);light.userData.f=f;light.position.set((b.x0+b.x1)/2,CEILING-.35,(b.z0+b.z1)/2);g.add(light);lights.set(r.id,light);}
  // Walls are split around window openings; doors already appear as gaps in the wall boxes.
  for(const wb of sim.world.wallBoxes.filter(w=>w.f===f&&w.kind!=='core')){const alongX=wb.x1-wb.x0>wb.z1-wb.z0;let side=null;if(wb.kind==='exterior')side=wb.side;const TOP=wb.kind==='exterior'?H-.3:CEILING;
   const openings=side?windowsBySide(f,side).map(w=>({a:(alongX?w.x:w.z)-w.width/2,b:(alongX?w.x:w.z)+w.width/2,sill:w.sill,head:w.head})).filter(o=>o.a>=(alongX?wb.x0:wb.z0)-.01&&o.b<=(alongX?wb.x1:wb.z1)+.01):[];
   if(side==='S'&&f===ENTRANCE.f)openings.push({a:ENTRANCE.x-.5,b:ENTRANCE.x+.5,sill:0,head:2.12,door:true});
   openings.sort((p,q)=>p.a-q.a);let s=alongX?wb.x0:wb.z0;const e=alongX?wb.x1:wb.z1;
   const piece=(a,b,y0,y1)=>{if(b-a<.002||y1-y0<.002)return;if(alongX){k.boxMM(a,b,y0,y1,wb.z0,wb.z1,A.wall);if(y0<CUT&&y1>CUT-.01)caps.boxMM(a,b,0,.02,wb.z0,wb.z1,M.cap);}else{k.boxMM(wb.x0,wb.x1,y0,y1,a,b,A.wall);if(y0<CUT&&y1>CUT-.01)caps.boxMM(wb.x0,wb.x1,0,.02,a,b,M.cap);}};
   for(const o of openings){piece(s,o.a,0,TOP);piece(o.a,o.b,0,o.sill);piece(o.a,o.b,o.head,TOP);s=o.b;}piece(s,e,0,TOP);
   // Baseboards and crown trim on every room-facing face.
   const faces=wb.kind==='exterior'?[{N:'z1',S:'z0',W:'x1',E:'x0'}[side]]:alongX?['z0','z1']:['x0','x1'];
   for(const fc of faces){const out=fc.endsWith('1')?1:-1,c=wb[fc];for(const [y0,y1,t]of [[0,.09,.014],[CEILING-.07,CEILING,.025]]){let s2=alongX?wb.x0:wb.z0;const segs=[];for(const o of openings.filter(o=>o.door||y0>=o.sill&&y1<=o.head||y0<o.sill&&o.sill<.1)){segs.push([s2,o.a]);s2=o.b;}segs.push([s2,e]);for(const [a,b]of segs)if(b-a>.02){if(alongX)kt.boxMM(a,b,y0,y1,out>0?c:c-t,out>0?c+t:c,A.trim);else kt.boxMM(out>0?c:c-t,out>0?c+t:c,y0,y1,a,b,A.trim);}}}
  }
  // Windows: frame, mullion, glazing, interior sill and a roller blind.
  for(const w of sim.world.windows.filter(w=>w.f===f)){const alongX=w.side==='N'||w.side==='S',c=alongX?w.x:w.z,a=c-w.width/2,b=c+w.width/2,t=.25,inner=w.side==='N'||w.side==='W'?1:-1,base=alongX?w.z:w.x,fr=.05;
   const bx=(a0,a1,y0,y1,d0,d1,m)=>alongX?k.boxMM(a0,a1,y0,y1,base+d0,base+d1,m):k.boxMM(base+d0,base+d1,y0,y1,a0,a1,m);
   bx(a,b,w.sill,w.sill+fr,-.06,.06,A.wframe);bx(a,b,w.head-fr,w.head,-.06,.06,A.wframe);bx(a,a+fr,w.sill,w.head,-.06,.06,A.wframe);bx(b-fr,b,w.sill,w.head,-.06,.06,A.wframe);if(w.width>1.3)bx(c-.025,c+.025,w.sill,w.head,-.05,.05,A.wframe);
   bx(a+fr,b-fr,w.sill+fr,w.head-fr,-.006,.006,A.glass);const din=inner*t/2;bx(a-.04,b+.04,w.sill-.03,w.sill,Math.min(din,din+inner*.2),Math.max(din,din+inner*.2),A.trim);
   if(w.sill>.5){bx(a,b,w.head-.07,w.head-.01,Math.min(din,din+inner*.1),Math.max(din,din+inner*.1),A.trim);bx(a+.03,b-.03,w.head-.07-(w.head-w.sill)*.28,w.head-.07,Math.min(din+inner*.04,din+inner*.05),Math.max(din+inner*.04,din+inner*.05),A.blind);}}
  // Interior door frames (head + casings).
  for(const d of sim.world.doors.filter(d=>d.f===f)){const ext=d.exterior,z=d.z,half=ext?.125:.06;for(const s of [-1,1]){k.boxMM(d.x-.5,d.x+.5,2.05,2.12,z-half,z+half,A.frame);for(const x of [d.x-.5,d.x+.5])k.boxMM(x-.035,x+.035,0,2.17,z+s*half-(s<0?.015:0),z+s*half+(s>0?.015:0),A.frame);k.boxMM(d.x-.535,d.x+.535,2.12,2.19,z+s*half-(s<0?.015:0),z+s*half+(s>0?.015:0),A.frame);}k.boxMM(d.x-.46,d.x+.46,0,.012,z-half,z+half,M.metal);}
  const arch=k.build();arch.traverse(o=>{if(o.isMesh)archMeshes.push(o);});g.add(arch,kt.build({cast:false}));const capMesh=caps.build({cast:false});capMesh.position.y=CUT-.01;g.add(capMesh);capGroups.push(capMesh);
 }
 // Door leaves rotate about their hinge; glass doors for meeting rooms and the office.
 const doorMeshes=new Map();
 for(const d of sim.world.doors){const A=archMats[d.f],pivot=new THREE.Group(),k=new Kit(),glassy=!!d.glass||d.exterior;
  const L=d.exterior?.92:.92,hgt=2.03;if(glassy){k.boxMM(0,L,0,hgt,-.02,.02,A.wframe);}else k.boxMM(0,L,0,hgt,-.02,.02,A.door,.004);
  const leaf=k.build();if(glassy){const gk=new Kit();gk.boxMM(.06,L-.06,.06,hgt-.06,-.008,.008,A.glassDoor);const gm=gk.build({cast:false});leaf.add(gm);leaf.children[0].geometry.dispose();const fk=new Kit();for(const [x0,x1,y0,y1]of [[0,.06,0,hgt],[L-.06,L,0,hgt],[0,L,0,.1],[0,L,hgt-.06,hgt]])fk.boxMM(x0,x1,y0,y1,-.02,.02,A.wframe);leaf.remove(leaf.children[0]);leaf.add(fk.build());}
  const hk=new Kit();for(const s of [-1,1]){hk.cyl(.012,.012,.05,L-.08,1.02,s*.045,A.handle,10,Math.PI/2);hk.box(.13,.018,.018,L-.13,1.02,s*.07,A.handle,.006);}for(const y of [.25,1.0,1.8])hk.cyl(.008,.008,.1,0,y,0,A.handle,8);leaf.add(hk.build());
  pivot.add(leaf);pivot.position.set(d.hinge.x,0,d.z);pivot.userData.objectId=d.id;floorGroups[d.f].add(pivot);doorMeshes.set(d.id,{pivot,angle:d.open?-d.swing*Math.PI/2:0});pivot.rotation.y=doorMeshes.get(d.id).angle;}

 // Stair towers outside the facade (one flight per floor, built from the agents' own path
 // geometry) and the lift core with its two cars.
 const tbox=(k,l,u0,u1,y0,y1,v0,v1,mat)=>{const a=stairLocal(l,u0,v0),b=stairLocal(l,u1,v1);k.boxMM(Math.min(a.x,b.x),Math.max(a.x,b.x),y0,y1,Math.min(a.z,b.z),Math.max(a.z,b.z),mat);};
 for(const l of LINKS.filter(l=>l.kind==='stair'))for(let f=l.floors[0];f<=l.floors[1];f++){
  const k=new Kit(),gl=new Kit(),top=f===l.floors[1],bottom=f===l.floors[0];
  if(bottom)tbox(k,l,0,3,-.3,0,-1.1,4.6,M.concrete);else tbox(k,l,.1,2.5,-.18,0,-1.1,.6,M.concrete);
  if(!top){const n=11,run=(u,vA,vB,y0,y1)=>{const dv=(vB-vA)/n,dy=(y1-y0)/n;for(let i=0;i<n;i++){const v0=vA+dv*i,v1=vA+dv*(i+1),y=y0+dy*(i+1);tbox(k,l,u-.45,u+.45,y-.04,y,Math.min(v0,v1)-.02,Math.max(v0,v1),M.oakFurniture);tbox(k,l,u-.45,u+.45,y-dy,y-.04,dv>0?v0:v1-.01,dv>0?v0+.01:v1,M.trim);}
     const len=Math.abs(vB-vA),ang=Math.atan2(y1-y0,len),mid=(vA+vB)/2;for(const sg of [-1,1]){const p=stairLocal(l,u+sg*.47,mid);k.add(new THREE.BoxGeometry(.04,.3,Math.hypot(len,y1-y0)),M.trim,p.x,(y0+y1)/2-.08,p.z,dv>0?-ang:ang);}};
   run(1.05,.6,3.4,0,H/2);run(2.05,3.4,.6,H/2,H);tbox(k,l,.6,2.5,H/2-.12,H/2,3.4,4.45,M.oakFurniture);
   tbox(gl,l,1.524,1.536,.05,H/2+.95,.6,3.4,M.glass);tbox(gl,l,1.564,1.576,H/2+.05,H+.95,.6,3.4,M.glass);tbox(k,l,1.45,1.65,.95,1.0,.6,3.4,M.walnut);}
  // Glazed enclosure with mullions on the three outer faces.
  tbox(gl,l,2.94,2.96,0,H,-1.1,4.6,M.glass);for(const v of [-1.13,4.57])tbox(gl,l,0,3,0,H,v-.012,v+.012,M.glass);
  for(let u=0;u<=3.01;u+=1)for(const v of [-1.13,4.57])tbox(k,l,u-.03,u+.03,0,H,v-.03,v+.03,M.windowFrame);for(let v=-1.1;v<=4.61;v+=1.14)tbox(k,l,2.92,2.98,0,H,v-.03,v+.03,M.windowFrame);
  tbox(k,l,0,3,H-.35,H-.3,-1.15,4.6,M.trim);if(top)tbox(k,l,0,3,H-.3,H+.1,-1.15,4.6,M.concrete);
  const sg=new THREE.Group();sg.userData.link=l.id;sg.add(k.build(),gl.build({cast:false}));floorGroups[f].add(sg);
 }
 // Lift core: shell walls (section-cut like other walls), shaft divider, landing doors; cars move with riders.
 const lifts=LINKS.filter(l=>l.kind==='lift'),coreCaps=[];
 for(let f=0;f<FLOORS;f++){const A=archMats[f],k=new Kit(),caps=new Kit(),t=.2,{x0,x1,z0,z1}=CORE;const wall=(a,b,c,d,y0=0,y1=CEILING)=>{k.boxMM(a,b,y0,y1,c,d,A.wall);if(y0<CUT&&y1>CUT)caps.boxMM(a,b,0,.02,c,d,M.cap);};
  let xs=x0;for(const l of lifts){wall(xs,l.landing.x-.65,z0,z0+t);wall(l.landing.x-.65,l.landing.x+.65,z0,z0+t,2.3,CEILING);xs=l.landing.x+.65;}wall(xs,x1,z0,z0+t);
  wall(x0,x1,z1-t,z1);wall(x0,x0+t,z0,z1);wall(x1-t,x1,z0,z1);wall((x0+x1)/2-.1,(x0+x1)/2+.1,z0,z1);
  for(const l of lifts){const x=l.landing.x;for(const sg of [-1,1])k.boxMM(x+sg*.3-.29,x+sg*.3+.29,0,2.2,z0-.03,z0+.01,M.metal);k.boxMM(x-.68,x+.68,2.2,2.32,z0-.05,z0+.02,M.chrome);for(const sg of [-1,1])k.boxMM(x+sg*.65-.04,x+sg*.65+.04,0,2.32,z0-.05,z0+.02,M.chrome);k.boxMM(x+.8,x+.9,1.05,1.25,z0-.04,z0,M.led);}
  k.boxMM(x0+t,x1-t,-.02,.0,z0+t,z1-t,M.concrete);
  floorGroups[f].add(k.build());const cm=caps.build({cast:false});cm.position.y=CUT-.01;floorGroups[f].add(cm);coreCaps.push(cm);}
 const liftCars=new Map();for(const l of lifts){const k=new Kit();k.boxMM(-.72,.72,0,.06,-.72,.72,M.metal);k.boxMM(-.72,.72,2.3,2.36,-.72,.72,M.metal);for(const [a,b]of [[-.72,-.66],[.66,.72]])for(const [c,d]of [[-.72,-.66],[.66,.72]])k.boxMM(a,b,.06,2.3,c,d,M.chrome);
  k.boxMM(-.72,-.7,.06,2.3,-.66,.66,M.glass);k.boxMM(.7,.72,.06,2.3,-.66,.66,M.glass);k.boxMM(-.66,.66,.06,2.3,.7,.72,M.glass);k.boxMM(-.6,.6,.95,1.0,.62,.66,M.chrome);const car=k.build();car.position.set(l.car.x,0,l.car.z);car.userData={link:l.id,y:0,f:l.floors[0]};scene.add(car);liftCars.set(l.id,car);}
 // Out-of-service stairs / lifts get a red barrier at their landing.
 for(const l of LINKS)if(!sim.world.linkOpen.has(l.id))for(let f=l.floors[0];f<=l.floors[1];f++){const k=new Kit(),red=new THREE.MeshStandardMaterial({color:'#d9534f',roughness:.5}),{x,z}=l.landing;if(l.kind==='lift'){k.boxMM(x-.62,x+.62,.9,1.05,CORE.z0-.12,CORE.z0-.06,red);k.boxMM(x-.62,x+.62,1.6,1.75,CORE.z0-.12,CORE.z0-.06,red);}else{const ex=l.side==='W'?.15:W-.15;k.boxMM(ex-.06,ex+.06,.85,1.0,z-.55,z+.55,red);k.boxMM(ex-.06,ex+.06,.25,.4,z-.55,z+.55,red);for(const dz of [-.5,.5])k.boxMM(ex-.04,ex+.04,0,1.0,z+dz-.04,z+dz+.04,M.metal);}floorGroups[f].add(k.build());}
 const linkLines=[];for(const l of LINKS)for(let f=l.floors[0];f<l.floors[1];f++){const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(l.landing.x,0,l.landing.z),new THREE.Vector3(l.landing.x,1,l.landing.z)]),new THREE.LineDashedMaterial({color:l.kind==='lift'?'#6f5bd1':'#5a6b62',dashSize:.25,gapSize:.18}));ln.userData={f,l};ln.computeLineDistances();scene.add(ln);linkLines.push(ln);}

 // Hindrance / affordance regions as translucent floor decals with an outline.
 const areaGroups=floorGroups.map(g=>{const a=new THREE.Group();g.add(a);return a;});let areaVersion=-1;
 function drawAreas(){for(const g of areaGroups){for(const o of [...g.children]){g.remove(o);o.traverse?.(x=>{x.geometry?.dispose();x.material?.dispose?.();});}}
  for(const a of sim.world.areas){const k=ZONE_KINDS[a.kind],w=a.x1-a.x0,d=a.z1-a.z0;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:k.color,transparent:true,opacity:a.kind==='glare'?.32:.38,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set((a.x0+a.x1)/2,.025,(a.z0+a.z1)/2);m.renderOrder=3;
   const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,d)),new THREE.LineBasicMaterial({color:k.color}));e.rotation.x=-Math.PI/2;e.position.copy(m.position);e.position.y=.03;areaGroups[a.f].add(m,e);}
  areaVersion=sim.world.areaVersion;}
 drawAreas();
 // ---------------------------------------------------------------- furniture & objects ---
 const objectMeshes=new Map(),smallObjects=[];
 function addObject(o){if(o.type==='door'||o.type==='window')return;const g=buildObject(o,M);g.position.set(o.x,o.y??0,o.z);g.rotation.y=o.rot??0;g.userData.objectId=o.id;floorGroups[o.f].add(g);objectMeshes.set(o.id,g);if(TYPES[o.type]?.small)smallObjects.push(g);g.traverse(m=>{if(m.isMesh)m.userData.base=m.material;});}
 sim.world.objects.forEach(addObject);

 // ---------------------------------------------------------------- agents ---
 const agentMeshes=new Map(),rings=new Map();
 function label(text,{bg='rgba(255,255,255,.88)',color='#24413a',scale=1}={}){const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font='600 30px "DM Sans", sans-serif';const tw=Math.ceil(ctx.measureText(text).width)+34;c.width=tw;c.height=50;ctx.font='600 30px "DM Sans", sans-serif';ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(1,1,tw-2,48,22);ctx.fill();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,17,26);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));s.scale.set(tw/50*.42*scale,.42*scale,1);s.renderOrder=20;return s;}
 function makeAgent(a){const g=new THREE.Group(),k=new Kit(),c=new THREE.MeshStandardMaterial({color:a.color,roughness:.5});
  if(a.type==='robot'){k.cyl(.36,.38,.2,0,.14,0,M.whitePlastic,32);k.cyl(.385,.385,.04,0,.07,0,M.rubberBlack,32);k.cyl(.3,.33,.08,0,.28,0,c,32);k.cyl(.06,.07,.55,-.05,.6,0,M.darkMetal,14);k.box(.16,.14,.32,.02,.95,0,M.whitePlastic,.04);k.box(.012,.06,.22,.105,.95,0,M.blackPlastic,.005);for(const z of [-.06,.06])k.cyl(.018,.018,.01,.112,.95,z,M.led,10,0,Math.PI/2);for(const z of [-.27,.27])k.cyl(.09,.09,.05,0,.09,z,M.rubberBlack,16,Math.PI/2);k.box(.3,.03,.38,-.05,.33,0,M.darkMetal,.01);}
  else if(a.type==='human'){const skin=new THREE.MeshStandardMaterial({color:['#e2b896','#c58c62','#8d5a3b','#f0cdb0','#a86f4b'][a.name.length%5],roughness:.6});const pants=new THREE.MeshStandardMaterial({color:'#3a4350',roughness:.8});
   for(const z of [-.09,.09]){k.cyl(.065,.055,.8,0,.42,z,pants,10);k.box(.24,.07,.11,.05,.035,z,M.blackPlastic,.02);}k.box(.22,.6,.4,0,1.12,0,c,.09);for(const z of [-.24,.24])k.cyl(.05,.045,.62,0,1.08,z,c,10);k.cyl(.05,.05,.1,0,1.47,0,skin,10);k.sphere(.11,0,1.6,0,skin,.95,1.1,.9);k.sphere(.115,-.02,1.66,0,new THREE.MeshStandardMaterial({color:'#2f2620',roughness:.8}),1,.75,1);}
  else{k.sphere(.22,0,.42,0,c,1.6,.8,.75);k.sphere(.14,.36,.6,0,c);k.box(.12,.08,.09,.48,.57,0,c,.03);for(const z of [-.08,.08])k.box(.04,.12,.06,.33,.72,z,M.walnut,.01);for(const x of [-.22,.2])for(const z of [-.09,.09])k.cyl(.035,.03,.36,x,.18,z,c,8);k.add(new THREE.CylinderGeometry(.025,.015,.3,8),c,-.4,.55,0,0,0,.9);}
  const body=k.build();g.add(body);const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.55,48),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;g.add(ring);rings.set(a.id,ring);
  const pts=[new THREE.Vector3(0,.06,0)];for(let i=0;i<=36;i++){const t=-a.fov/2+a.fov*i/36;pts.push(new THREE.Vector3(Math.cos(t)*a.range,.06,Math.sin(t)*a.range));}const verts=[];for(let i=1;i<pts.length-1;i++)for(const p of [pts[0],pts[i],pts[i+1]])verts.push(p.x,p.y,p.z);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  const cone=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:a.type==='robot'?.13:.05,depthWrite:false,side:THREE.DoubleSide}));g.add(cone);
  const name=label(a.name,{scale:.75});name.position.y=a.type==='human'?2.05:a.type==='robot'?1.35:.95;g.add(name);g.userData.agent=a.id;body.traverse(m=>m.userData.agent=a.id);scene.add(g);agentMeshes.set(a.id,{g,body,cone,name});}
 sim.agents.forEach(makeAgent);

 // ---------------------------------------------------------------- overlays ---
 const overlay=new THREE.Group();scene.add(overlay);
 const navGroup=new THREE.Group(),mapGroup=new THREE.Group(),semGroup=new THREE.Group(),graphGroup=new THREE.Group(),colliderGroup=new THREE.Group(),sensorGroup=new THREE.Group();overlay.add(navGroup,mapGroup,semGroup,graphGroup,colliderGroup,sensorGroup);
 const mapTex=Array.from({length:FLOORS},()=>{const data=new Uint8Array(NX*NZ*4),t=new THREE.DataTexture(data,NX,NZ,THREE.RGBAFormat);t.magFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;});
 const mapPlanes=Array.from({length:FLOORS},(_,f)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(NX*RES,NZ*RES),new THREE.MeshBasicMaterial({map:mapTex[f],transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(NX*RES/2-RES/2,.06,NZ*RES/2-RES/2);m.renderOrder=5;floorGroups[f].add(m);m.visible=false;return m;});
 const selBox=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#ff7a3d'));selBox.visible=false;scene.add(selBox);
 const clear=g=>{for(const o of [...g.children]){g.remove(o);o.traverse?.(x=>{x.geometry?.dispose();if(x.material&&!x.material.userData?.shared){x.material.map?.dispose();x.material.dispose?.();}});}};
 const lineMat=(color,opacity=1,dashed=false)=>dashed?new THREE.LineDashedMaterial({color,dashSize:.25,gapSize:.15,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});

 // ---------------------------------------------------------------- state ---
 let mode='realistic',floor='both',selected='agent-0',selectedObject=null,showCones=true,showPaths=true,showLandmarks=true,showColliders=false,quality='high',lastOverlay=-1,lastMap=-1,lastCull=0,colliderVersion=-1,wallsFull=false;
 const yOf=f=>floor==='both'?f*EXPLODE:f*H;
 const aoPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),CUT);
 const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera),gtao=new GTAOPass(scene,camera,1,1),output=new OutputPass();gtao.blendIntensity=.85;try{gtao.updateGtaoMaterial({radius:.45,distanceExponent:1.4,thickness:1.2,scale:1,samples:12});gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,rings:2,samples:12});}catch{}composer.addPass(renderPass);composer.addPass(gtao);composer.addPass(output);
 function setQuality(q){quality=q;renderer.shadowMap.enabled=q!=='fast';sun.castShadow=q!=='fast';sun.shadow.mapSize.set(q==='high'?4096:2048,q==='high'?4096:2048);sun.shadow.map?.dispose();sun.shadow.map=null;renderer.setPixelRatio(q==='fast'?1:Math.min(devicePixelRatio,q==='high'?1.75:1.5));resize();for(const l of lights.values())l.castShadow=false;applyWalls();scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}
 function applyWalls(){const full=wallsFull||mode==='robot';for(const c of coreCaps)c.visible=!full;for(let f=0;f<FLOORS;f++){archMats[f].clip.constant=full?1e3:yOf(f)+CUT;capGroups[f].visible=!full;}for(const c of ceilings)c.visible=mode==='robot'||wallsFull;
  // The AO pre-pass uses an override material, so it must receive the same section cut; in the
  // exploded two-floor view no single plane fits both floors, so AO is skipped there.
  aoPlane.constant=yOf(floor==='both'?0:Number(floor))+CUT;gtao.normalMaterial.clippingPlanes=full?[]:[aoPlane];gtao.normalMaterial.needsUpdate=true;gtao.enabled=quality==='high'&&(full||floor!=='both');}
 function layoutFloors(){for(let f=0;f<FLOORS;f++){floorGroups[f].position.y=yOf(f);floorGroups[f].visible=floor==='both'||Number(floor)===f;}
  // Point lights only for the floor in view (keeps the light count, and the shader cost, small).
  for(const l of lights.values())l.visible=floor!=='both'&&Number(floor)===l.userData.f;
  for(const ln of linkLines){ln.visible=floor==='both';const a=ln.geometry.attributes.position;a.setY(0,yOf(ln.userData.f)+H+.05);a.setY(1,yOf(ln.userData.f+1)+.05);a.needsUpdate=true;ln.computeLineDistances();}
  applyWalls();lastOverlay=-1;lastMap=-1;}
 function setFloor(f){floor=f;layoutFloors();if(f==='both'){controls.target.set(CX,EXPLODE*(FLOORS-1)/2,CZ);camera.position.set(CX+62,EXPLODE*(FLOORS-1)/2+46,CZ+78);}else{const y=Number(f)*H;controls.target.set(CX,y+.8,CZ);camera.position.set(CX+30,y+38,CZ+44);}}

 // Semantic colouring: objects the robot has recognised take their category colour; unknown ones fade.
 const semMats=new Map(),ghost=new THREE.MeshStandardMaterial({color:'#c9ccc8',transparent:true,opacity:.18,depthWrite:false});
 const semMat=c=>{if(!semMats.has(c))semMats.set(c,new THREE.MeshStandardMaterial({color:CATEGORY_COLOURS[c]??'#bbbbbb',roughness:.65,emissive:CATEGORY_COLOURS[c]??'#bbbbbb',emissiveIntensity:.12}));return semMats.get(c);};
 function applyMaterials(){const belief=sim.robot.belief;for(const [id,g]of objectMeshes){const o=sim.world.object(id)??sim.world.objects.find(x=>x.id===id),b=belief.objects.get(id),known=b&&b.present!==false;
   g.traverse(m=>{if(!m.isMesh)return;m.material=mode==='semantic'?(known?semMat(o?.category):ghost):mode==='mapping'?ghost:m.userData.base;});}
  for(const [id,r]of roomFloors){const room=sim.world.rooms.find(x=>x.id===id);if(mode==='semantic'){const reg=[...belief.regions.values()].find(g=>g.cells.some(c=>{const [x,z,f]=c.split(',').map(Number);return f===room.f&&x>=room.bounds.x0&&x<=room.bounds.x1&&z>=room.bounds.z0&&z<=room.bounds.z1;}));r.material=new THREE.MeshStandardMaterial({color:ROOM_COLOURS[reg?.label??'unknown'],roughness:.9,transparent:!reg,opacity:reg?1:.5});}else if(r.userData.base){r.material=r.userData.base;}if(!r.userData.base)r.userData.base=M[FLOOR_FINISH[room.type]??'oak'];}
  const ghostArch=mode==='mapping'||mode==='semantic';for(let f=0;f<FLOORS;f++){const A=archMats[f];for(const k of ['wall','trim','frame','door','wframe','blind']){A[k].transparent=ghostArch;A[k].opacity=ghostArch?(mode==='mapping'?.18:.45):1;A[k].depthWrite=!ghostArch;A[k].needsUpdate=true;}}}
 function setMode(m){mode=m;applyWalls();applyMaterials();for(const p of mapPlanes)p.visible=m==='mapping';lastOverlay=-1;lastMap=-1;controls.enabled=m!=='robot';for(const {g}of agentMeshes.values())g.visible=true;}

 // ---------------------------------------------------------------- overlays per mode ---
 function drawNavigation(){clear(navGroup);const a=sim.agents.find(x=>x.id===selected)??sim.robot,show=f=>floor==='both'||Number(floor)===f;
  if(showPaths||mode==='navigation'){const seg=[];for(let i=1;i<a.trail.length;i++){const p=a.trail[i-1],q=a.trail[i];if(p.f===q.f&&show(p.f)&&Math.hypot(p.x-q.x,p.z-q.z)<1.5)seg.push(new THREE.Vector3(p.x,yOf(p.f)+.07,p.z),new THREE.Vector3(q.x,yOf(q.f)+.07,q.z));}if(seg.length)navGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg),lineMat(a.color,.55)));
   const route=[{x:a.x,z:a.z,f:a.f},...a.path].filter(p=>show(p.f)).map(p=>new THREE.Vector3(p.x,yOf(p.f)+.1,p.z));if(route.length>1){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route),lineMat('#e0892f',1,true));l.computeLineDistances();navGroup.add(l);}}
  if(showLandmarks)for(const l of a.landmarks.values())if(show(l.f)){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.13),new THREE.MeshBasicMaterial({color:'#d5a759'}));m.position.set(l.ox??l.x,yOf(l.f)+1.2,l.oz??l.z);navGroup.add(m);}
  if(mode!=='navigation')return;
  if(a.goal&&show(a.goal.f)){const pin=new THREE.Group(),k=new Kit();k.cyl(.0,.12,.45,0,.22,0,new THREE.MeshBasicMaterial({color:'#e0892f'}),12);k.sphere(.14,0,.55,0,new THREE.MeshBasicMaterial({color:'#e0892f'}));pin.add(k.build({cast:false}));pin.position.set(a.goal.x,yOf(a.goal.f),a.goal.z);navGroup.add(pin);const lab=label(a.goal.label??'Goal',{scale:.6,bg:'rgba(224,137,47,.92)',color:'#fff'});lab.position.set(a.goal.x,yOf(a.goal.f)+1.0,a.goal.z);navGroup.add(lab);}
  if(a===sim.robot){const f=a.f;if(show(f)){const cells=[...a.memory.entries()].filter(([k,v])=>v.blocked&&k.endsWith(`,${f}`));const geo=new THREE.PlaneGeometry(.92,.92);geo.rotateX(-Math.PI/2);const im=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'#d9534f',transparent:true,opacity:.22,depthWrite:false}),Math.max(1,cells.length));const mtx=new THREE.Matrix4();cells.forEach(([k],i)=>{const [x,z]=k.split(',').map(Number);mtx.makeTranslation(x,yOf(f)+.04,z);im.setMatrixAt(i,mtx);});im.count=cells.length;navGroup.add(im);
    for(const [r,c,o]of [[.43,'#2c6756',.9],[1.05,'#e0892f',.5]]){const ring=new THREE.Mesh(new THREE.RingGeometry(r-.02,r,48),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(a.x,yOf(f)+.05,a.z);navGroup.add(ring);}
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(Math.cos(a.heading),0,Math.sin(a.heading)),new THREE.Vector3(a.x,yOf(f)+.2,a.z),1.2,'#2c6756',.3,.18);navGroup.add(arrow);
    const est=a.localizer.est;const e=new THREE.Mesh(new THREE.RingGeometry(.12,.16,24),new THREE.MeshBasicMaterial({color:'#6f5bd1',side:THREE.DoubleSide}));e.rotation.x=-Math.PI/2;e.position.set(est.x,yOf(f)+.08,est.z);navGroup.add(e);}}}
 function drawSensors(){clear(sensorGroup);const r=sim.robot,s=r.lastScan;if(!s||!['mapping','navigation','robot'].includes(mode)||!(floor==='both'||Number(floor)===r.f)||r.stair)return;const y=yOf(r.f);
  const seg=[];s.lidar.forEach((b,i)=>{if(i%3)return;const th=r.heading+b.a;seg.push(new THREE.Vector3(r.x,y+.18,r.z),new THREE.Vector3(r.x+Math.cos(th)*b.r,y+.18,r.z+Math.sin(th)*b.r));});sensorGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg),lineMat('#d9534f',.18)));
  const pts=s.depth.points.map(p=>new THREE.Vector3(p.x,y+p.y,p.z));if(pts.length)sensorGroup.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts),new THREE.PointsMaterial({color:'#2fb38f',size:.06,transparent:true,opacity:.9})));}
 function drawMap(){const r=sim.robot,map=r.map,belief=r.belief;for(let f=0;f<FLOORS;f++){if(floor!=='both'&&Number(floor)!==f)continue;const data=mapTex[f].image.data,fr=new Set();for(const c of map.frontiers(f,1))for(const [x,z]of c.cells)fr.add(z*NX+x);
   const regionCol=new Map();for(const g of belief.regions.values())if(g.f===f){const h=(ROOM_COLOURS[g.label]??'#bbbbbb').slice(1),c={r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};for(const k of g.cells){const [x,z]=k.split(',').map(Number);regionCol.set(`${x},${z}`,c);}}
   for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){const i=iz*NX+ix,s=map.state(f,i),o=((NZ-1-iz)*NX+ix)*4;
    if(fr.has(i)){data.set([242,176,58,235],o);}else if(s===2){data.set([34,44,48,240],o);}else if(s===1){const rc=regionCol.get(`${Math.round(ix*RES)},${Math.round(iz*RES)}`);if(rc)data.set([rc.r,rc.g,rc.b,200],o);else data.set([226,238,230,200],o);}
    else{const inBuilding=ix*RES>.1&&ix*RES<W-.1&&iz*RES>.1&&iz*RES<D-.1;data.set(inBuilding?(((ix+iz)%4===0)?[150,156,160,70]:[120,126,130,40]):[0,0,0,0],o);}}
   mapTex[f].needsUpdate=true;}}
 function drawSemanticLabels(){clear(semGroup);if(mode!=='semantic')return;for(const g of sim.robot.belief.regions.values()){if(!(floor==='both'||Number(floor)===g.f))continue;const ps=g.cells.map(c=>c.split(',').map(Number));const x=ps.reduce((s,p)=>s+p[0],0)/ps.length,z=ps.reduce((s,p)=>s+p[1],0)/ps.length;const l=label(`${g.name} · ${Math.round(g.confidence*100)}%`,{bg:'rgba(30,48,42,.85)',color:'#fff',scale:.95});l.position.set(x,yOf(g.f)+2.1,z);semGroup.add(l);}}
 function drawGraph(){clear(graphGroup);if(!selectedObject)return;const o=sim.world.object(selectedObject);if(!o)return;const from=centre(o);const edges=sim.graph.edges.filter(e=>(e.from===selectedObject||e.to===selectedObject)&&['on_top_of','next_to','behind','obstructed_by','accessible_from','connected_to'].includes(e.type));
  const colors={on_top_of:'#2c6756',next_to:'#8aa6c1',behind:'#9b8fd1',obstructed_by:'#d9534f',accessible_from:'#e0892f',connected_to:'#b38b59'};
  const labelled=new Set();for(const e of edges){const other=e.from===selectedObject?e.to:e.from,t=sim.world.object(other);let p;if(t)p=centre(t);else{const reg=sim.robot.belief.regions.get(other);if(!reg)continue;const ps=reg.cells.map(c=>c.split(',').map(Number));p=new THREE.Vector3(ps.reduce((s,q)=>s+q[0],0)/ps.length,yOf(reg.f)+.3,ps.reduce((s,q)=>s+q[1],0)/ps.length);}
   const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,p]),lineMat(colors[e.type],.95,true));l.computeLineDistances();graphGroup.add(l);const dot=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshBasicMaterial({color:colors[e.type]}));dot.position.copy(p);graphGroup.add(dot);
   if(!labelled.has(e.type)){labelled.add(e.type);const n=edges.filter(x=>x.type===e.type).length;const lab=label(`${e.type.replace(/_/g,' ')}${n>1?' ×'+n:''}`,{scale:.42,bg:colors[e.type],color:'#fff'});lab.position.copy(p).add(new THREE.Vector3(0,.45,0));graphGroup.add(lab);}}}
 const centre=o=>{const b=o.aabb;return new THREE.Vector3((b.x0+b.x1)/2,yOf(o.f)+(b.y0+b.y1)/2,(b.z0+b.z1)/2);};
 function drawColliders(){clear(colliderGroup);if(!showColliders)return;const v=[];for(const c of sim.world.colliders){if(!(floor==='both'||Number(floor)===c.f))continue;const y=yOf(c.f),x0=c.x0,x1=c.x1,y0=c.y0+y,y1=c.y1+y,z0=c.z0,z1=c.z1;const P=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];for(const [a,b]of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])v.push(...P[a],...P[b]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));colliderGroup.add(new THREE.LineSegments(g,lineMat('#ff3d7f',.85)));colliderVersion=sim.world.version;}

 // ---------------------------------------------------------------- picking ---
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let down;
 renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>5||mode==='robot')return;const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);
  const agents=raycaster.intersectObjects([...agentMeshes.values()].filter(o=>o.g.visible).map(o=>o.body),true);if(agents.length){onSelect(agents[0].object.userData.agent);return;}
  const targets=[...objectMeshes.values(),...[...doorMeshes.values()].map(d=>d.pivot)].filter(g=>g.visible&&g.parent?.visible);const hits=raycaster.intersectObjects(targets,true);for(const h of hits){let o=h.object;while(o&&!o.userData.objectId)o=o.parent;if(o){selectObject(o.userData.objectId);onPick(o.userData.objectId);return;}}});
 function selectObject(id){selectedObject=id;const o=id&&sim.world.object(id);if(o?.aabb){const y=yOf(o.f);selBox.box.set(new THREE.Vector3(o.aabb.x0-.03,o.aabb.y0+y-.02,o.aabb.z0-.03),new THREE.Vector3(o.aabb.x1+.03,o.aabb.y1+y+.03,o.aabb.z1+.03));selBox.visible=true;}else selBox.visible=false;lastOverlay=-1;}

 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);composer.setSize(w,h);gtao.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();pov.aspect=w/h;pov.fov=2*Math.atan(Math.tan(105/2*Math.PI/180)/Math.max(.6,w/h))*180/Math.PI;pov.updateProjectionMatrix();};
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 let frames=0,frameTime=0,lastT=performance.now();const stats={fps:0,drawCalls:0,triangles:0};

 function update(){const now=performance.now(),dt=now-lastT;lastT=now;frames++;frameTime+=dt;if(frameTime>1000){stats.fps=Math.round(frames*1000/frameTime);frames=0;frameTime=0;}
  for(const a of sim.agents){if(!agentMeshes.has(a.id))makeAgent(a);const {g,cone,name}=agentMeshes.get(a.id);const p=a.renderPos;g.position.set(p?.x??a.x,p?yOf(p.lo)+p.y:yOf(a.f),p?.z??a.z);g.rotation.y=-a.heading;
   g.visible=(floor==='both'||(p?Number(floor)===p.lo||Number(floor)===a.stair?.to:a.f===Number(floor)))&&!(mode==='robot'&&a===sim.robot);cone.visible=showCones&&(a.id===selected||a.type==='robot')&&mode!=='robot';name.visible=mode!=='robot';rings.get(a.id).material.opacity=a.id===selected?1:.35;}
  for(const o of sim.world.objects){let g=objectMeshes.get(o.id);if(!g&&o.type!=='door'&&o.type!=='window'){addObject(o);g=objectMeshes.get(o.id);if(mode!=='realistic')applyMaterials();}if(!g)continue;g.visible=o.active!==false;if(o.solid){g.position.x=o.x;g.position.z=o.z;}}
  for(const d of sim.world.doors){const m=doorMeshes.get(d.id),target=d.open?-d.swing*Math.PI/2:0;m.angle+=(target-m.angle)*.15;m.pivot.rotation.y=m.angle;}
  for(const [id,car]of liftCars){const rider=sim.agents.find(a=>a.stair?.link===id);if(rider?.renderPos){const p=rider.renderPos;car.userData.y=p.y;car.userData.f=p.lo;}const y=yOf(car.userData.f)+car.userData.y;car.position.y=y;car.visible=floor==='both'||(y>=yOf(Number(floor))-.5&&y<=yOf(Number(floor))+H-.5);}
  if(areaVersion!==sim.world.areaVersion)drawAreas();
  // Real sun: direction from the site's solar position, intensity from elevation and cloud cover.
  const c=sim.conditions;if(c){const v=c.vector,day=c.daylight*(1-.55*(c.cloud??0)/100);if(v.y>.01){sun.position.set(CX+v.x*90,Math.max(4,v.y*90),CZ+v.z*90);sun.intensity=.4+2.4*day;}else{sun.position.set(CX-20,60,CZ+20);sun.intensity=.12;}hemi.intensity=.3+.5*c.daylight;
   const bg=c.daylight>.5?'#e9ece6':c.daylight>.05?'#d9d6cf':'#69727a';if(scene.background.getHexString()!==bg.slice(1)){scene.background.set(bg);scene.fog.color.set(bg);}}
  for(const r of sim.world.rooms){const l=lights.get(r.id);if(l)l.intensity+=((r.light?(r.kind==='corridor'?9:14):0)-l.intensity)*.1;}
  if(now-lastCull>400){lastCull=now;const cp=mode==='robot'?pov.position:camera.position;for(const g of smallObjects){const wp=g.getWorldPosition(new THREE.Vector3());g.visible=g.visible&&wp.distanceTo(cp)<(mode==='robot'?14:30);}}
  if(Math.abs(sim.time-lastOverlay)>.35||lastOverlay<0){drawNavigation();drawSensors();drawSemanticLabels();drawGraph();lastOverlay=sim.time;if(mode==='semantic')applyMaterials();}
  if(mode==='mapping'&&(Math.abs(sim.time-lastMap)>.6||lastMap<0)){drawMap();lastMap=sim.time;}
  if(showColliders&&colliderVersion!==sim.world.version)drawColliders();
  let cam=camera;if(mode==='robot'){const r=sim.robot,p=r.renderPos;pov.position.set(p?.x??r.x,(p?yOf(p.lo)+p.y:yOf(r.f))+.95,p?.z??r.z);pov.lookAt(pov.position.x+Math.cos(r.heading),pov.position.y-.08,pov.position.z+Math.sin(r.heading));cam=pov;}else controls.update();
  renderPass.camera=cam;gtao.camera=cam;if(gtao.enabled&&mode!=='robot')composer.render();else renderer.render(scene,cam);stats.drawCalls=renderer.info.render.calls;stats.triangles=renderer.info.render.triangles;
 }
 setFloor('both');setQuality('high');setMode('realistic');
 return {renderer,scene,camera,controls,update,setFloor,setMode,setQuality,selectObject,stats,get mode(){return mode;},select(id){selected=id;lastOverlay=-1;},
  toggles(o){({showCones=showCones,showPaths=showPaths,showLandmarks=showLandmarks,showColliders=showColliders}=o);if(o.fullWalls!==undefined){wallsFull=o.fullWalls;applyWalls();}lastOverlay=-1;colliderVersion=-1;if(!showColliders)clear(colliderGroup);},
  home(){setFloor(floor);},focusObject(id){const o=sim.world.object(id);if(!o)return;if(floor!=='both'&&Number(floor)!==o.f)setFloor(String(o.f));const c=centre(o);controls.target.copy(c);camera.position.set(c.x+5,c.y+6,c.z+7);selectObject(id);},
  dispose(){observer.disconnect();controls.dispose();composer.dispose?.();scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});pmrem.dispose();renderer.dispose();renderer.domElement.remove();}};
}
