// Parametric 3D models for every catalog type. Each model is built in the object's local frame
// (x = width, z = depth with the front at +z, y = up from the base) from the same dimensions and
// part boxes the simulation uses for colliders and semantics, so visuals, physics and the scene
// graph cannot drift apart. Static pieces are merged per material to keep draw calls low.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Planar UVs in metres chosen by the dominant normal, so textures keep real-world scale.
export function metricUV(geo){const p=geo.attributes.position,n=geo.attributes.normal,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;if(ay>=ax&&ay>=az){u=p.getX(i);v=p.getZ(i);}else if(ax>=az){u=p.getZ(i);v=p.getY(i);}else{u=p.getX(i);v=p.getY(i);}uv[i*2]=u;uv[i*2+1]=v;}geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));return geo;}

export class Kit{
 constructor(){this.byMat=new Map();this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();}
 add(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){if(geo.index)geo=geo.toNonIndexed();metricUV(geo);this.e.set(rx,ry,rz);this.q.setFromEuler(this.e);this.m.compose(new THREE.Vector3(x,y,z),this.q,new THREE.Vector3(sx,sy,sz));geo.applyMatrix4(this.m);for(const k of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(k))geo.deleteAttribute(k);if(!this.byMat.has(mat))this.byMat.set(mat,[]);this.byMat.get(mat).push(geo);return this;}
 // Box by its min/max corners (local metres).
 boxMM(x0,x1,y0,y1,z0,z1,mat,r=0){const w=Math.max(.002,x1-x0),h=Math.max(.002,y1-y0),d=Math.max(.002,z1-z0);const g=r>0?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2-.001,h/2-.001,d/2-.001)):new THREE.BoxGeometry(w,h,d);return this.add(g,mat,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2);}
 box(w,h,d,x,y,z,mat,r=0,ry=0){const g=r>0?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2-.001,h/2-.001,d/2-.001)):new THREE.BoxGeometry(w,h,d);return this.add(g,mat,x,y,z,0,ry);}
 cyl(rt,rb,h,x,y,z,mat,seg=20,rx=0,rz=0){return this.add(new THREE.CylinderGeometry(rt,rb,h,seg),mat,x,y,z,rx,0,rz);}
 sphere(r,x,y,z,mat,sx=1,sy=1,sz=1,seg=14){return this.add(new THREE.SphereGeometry(r,seg,Math.max(6,seg*.7|0)),mat,x,y,z,0,0,0,sx,sy,sz);}
 torus(r,t,x,y,z,mat,rx=Math.PI/2,ry=0,arc=Math.PI*2){return this.add(new THREE.TorusGeometry(r,t,8,24,arc),mat,x,y,z,rx,ry,0);}
 lathe(points,x,y,z,mat,seg=24){return this.add(new THREE.LatheGeometry(points.map(([a,b])=>new THREE.Vector2(a,b)),seg),mat,x,y,z);}
 build({cast=true,receive=true}={}){const g=new THREE.Group();for(const [mat,geos]of this.byMat){const merged=mergeGeometries(geos.map(x=>x.index?x:x),false);if(!merged)continue;const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=cast&&!mat.transparent;mesh.receiveShadow=receive;g.add(mesh);}return g;}
}

// Parts (drawers, doors, handles, lids) come straight from the catalog part boxes.
function drawParts(k,o,M,{front=M.laminate,handle=M.metal}={}){for(const p of o.parts??[]){if(p.box&&['drawer','door'].includes(p.kind))k.boxMM(p.box.x0+.004,p.box.x1-.004,p.box.y0+.004,p.box.y1-.004,p.box.z0-.006,p.box.z1-.004,front,.004);
  for(const c of p.children??[])if(c.box&&c.kind==='handle'){const b=c.box;k.boxMM(b.x0,b.x1,b.y0,b.y1,b.z0+.008,b.z1,handle,.004);const w=b.x1-b.x0>b.y1-b.y0;if(w){k.boxMM(b.x0,b.x0+.012,b.y0,b.y1,b.z0-.012,b.z0+.01,handle);k.boxMM(b.x1-.012,b.x1,b.y0,b.y1,b.z0-.012,b.z0+.01,handle);}else{k.boxMM(b.x0,b.x1,b.y0,b.y0+.012,b.z0-.012,b.z0+.01,handle);k.boxMM(b.x0,b.x1,b.y1-.012,b.y1,b.z0-.012,b.z0+.01,handle);}}}}
function casework(k,o,M,{body=M.laminate,top=null,topT=.03,plinth=.08,frontMat=null,overhang=0}){const {w,d,h}=o.size,z0=-d/2,z1=d/2-.022;const hb=top?h-topT:h;
 if(plinth)k.boxMM(-w/2+.02,w/2-.02,0,plinth,z0,z1-.06,M.blackPlastic);k.boxMM(-w/2,w/2,plinth||0,hb,z0,z1,body);
 if(top)k.boxMM(-w/2-.01,w/2+.01,hb,h,z0-(overhang<0?-overhang:0),d/2+.012+(overhang>0?overhang:0),top,.004);drawParts(k,o,M,{front:frontMat??body});}
function tableLegs(k,o,M,legMat,{style='four',topMat}){const {w,d,h}=o.size,t=.035;k.boxMM(-w/2,w/2,h-t,h,-d/2,d/2,topMat,.006);
 if(style==='four'){for(const sx of [-1,1])for(const sz of [-1,1])k.boxMM(sx*(w/2-.06)-.025,sx*(w/2-.06)+.025,0,h-t,sz*(d/2-.06)-.025,sz*(d/2-.06)+.025,legMat);}
 else if(style==='frame'){for(const sx of [-1,1]){k.boxMM(sx*(w/2-.05)-.025,sx*(w/2-.05)+.025,0,h-t,-d/2+.04,-d/2+.09,legMat);k.boxMM(sx*(w/2-.05)-.025,sx*(w/2-.05)+.025,0,h-t,d/2-.09,d/2-.04,legMat);k.boxMM(sx*(w/2-.05)-.025,sx*(w/2-.05)+.025,0,.04,-d/2+.04,d/2-.04,legMat);k.boxMM(sx*(w/2-.05)-.025,sx*(w/2-.05)+.025,h-t-.05,h-t,-d/2+.04,d/2-.04,legMat);}}
 else if(style==='pedestal'){const n=w>2.2?2:1;for(let i=0;i<n;i++){const x=n===2?(i?w/4:-w/4):0;k.boxMM(x-.09,x+.09,.03,h-t,-.09,.09,legMat);k.boxMM(x-.3,x+.3,0,.03,-d/2+.12,d/2-.12,legMat,.01);}}}
function chairFrame(k,M,{w=.48,d=.5,seatH=.46,backH=.9,seat=M.fabricNavy,frame=M.darkMetal}={}){k.box(w,.07,d,0,seatH-.035,0,seat,.03);k.box(w,backH-seatH-.05,.06,0,(seatH+backH)/2+.02,-d/2+.04,seat,.03);for(const sx of [-1,1])for(const sz of [-1,1])k.cyl(.012,.012,seatH-.07,sx*(w/2-.04),(seatH-.07)/2,sz*(d/2-.05),frame,8);}
function plant(k,M,{h=1.4,r=.25}){k.cyl(r,r*.8,r*1.5,0,r*.75,0,M.pot,20);k.cyl(r*.92,r*.92,.02,0,r*1.5-.02,0,M.soil);k.cyl(.02,.025,h*.55,0,r*1.5+h*.25,0,M.walnut,6);const rng=(i)=>Math.sin(i*12.9898)*.5+.5;for(let i=0;i<18;i++){const a=i*2.39996,y=r*1.5+h*.25+rng(i)*h*.55,rr=(.12+rng(i+5)*.22)*(1-(y-r*1.5)/(h*1.3));k.sphere(.11+rng(i+9)*.07,Math.cos(a)*rr,y,Math.sin(a)*rr,i%3?M.plantLeaf:M.plantLeafLight,1.1,.38,.7,8);}}
function books(k,M,x0,x1,y,z0,z1,seed=1){let x=x0;let i=seed;while(x<x1-.02){const bw=.018+((i*37)%17)/1000*2,bh=.17+((i*53)%9)/100;if(x+bw>x1)break;const lean=(i%11===0)?.15:0;k.add(new THREE.BoxGeometry(bw,bh,(z1-z0)*.85),M.books[i%M.books.length],x+bw/2,y+bh/2,(z0+z1)/2,0,0,lean);x+=bw+.002;i++;if(i%19===0)x+=.06;}}

export function buildObject(o,M){const k=new Kit(),{w,d,h}=o.size;let cast=true;
 switch(o.type){
  case 'workstation':{tableLegs(k,o,M,M.darkMetal,{style:'frame',topMat:M.laminate});k.boxMM(-w/2+.08,w/2-.08,.35,h-.06,-d/2+.02,-d/2+.035,M.laminateGrey);k.boxMM(-w/2+.08,w/2-.08,h,h+.36,-d/2-.005,-d/2+.02,M.fabricSage,.01);
   if(o.parts?.length){const xs=o.parts.map(p=>p.box);const x0=Math.min(...xs.map(b=>b.x0)),x1=Math.max(...xs.map(b=>b.x1));k.boxMM(x0,x1,.06,xs[0].y1+.01>h?h-.06:Math.max(...xs.map(b=>b.y1))+.005,-d/2+.06,d/2-.02,M.laminateGrey);drawParts(k,o,M,{front:M.laminate});k.cyl(.025,.025,.04,x0+.05,.03,d/2-.08,M.blackPlastic);}
   k.boxMM(-w/2+.15,w/2-.15,h-.12,h-.1,-d/2+.08,-d/2+.2,M.darkMetal);break;}
  case 'desk':{k.boxMM(-w/2,w/2,h-.04,h,-d/2,d/2,M.walnut,.006);k.boxMM(-w/2,-w/2+.04,0,h-.04,-d/2,d/2,M.walnut);k.boxMM(w/2-.04,w/2,0,h-.04,-d/2,d/2,M.walnut);k.boxMM(-w/2+.04,w/2-.04,.25,h-.04,-d/2+.02,-d/2+.05,M.walnut);
   if(o.parts?.length){const xs=o.parts.map(p=>p.box);k.boxMM(Math.min(...xs.map(b=>b.x0)),w/2-.04,Math.min(...xs.map(b=>b.y0))-.02,h-.04,-d/2+.05,d/2-.02,M.walnut);drawParts(k,o,M,{front:M.walnut,handle:M.metal});}break;}
  case 'conference-table':tableLegs(k,o,M,M.darkMetal,{style:o.size.w>1.6?'pedestal':'four',topMat:o.size.w>1.6?M.walnut:M.oakFurniture});if(o.size.w>2)k.boxMM(-.15,.15,o.size.h-.002,o.size.h+.004,-.1,.1,M.darkMetal);break;
  case 'coffee-table':case 'side-table':case 'console':case 'dining-table':tableLegs(k,o,M,M.walnut,{style:'four',topMat:M.oakFurniture});break;
  case 'reception-desk':{k.boxMM(-w/2,w/2,0,h-.03,d/2-.08,d/2,M.oakFurniture);k.boxMM(-w/2,w/2,h-.03,h,d/2-.32,d/2+.02,M.marble,.004);k.boxMM(-w/2,w/2,.72,.75,-d/2,d/2-.08,M.laminate);k.boxMM(-w/2,-w/2+.05,0,.72,-d/2,d/2-.08,M.laminate);k.boxMM(w/2-.05,w/2,0,h-.03,-d/2,d/2-.08,M.oakFurniture);
   for(let x=-w/2+.08;x<w/2-.05;x+=.09)k.boxMM(x,x+.04,.05,h-.08,d/2,d/2+.025,M.walnut);k.boxMM(-w/2+.15,-w/2+.4,.05,.7,-d/2+.05,d/2-.1,M.laminateGrey);drawParts(k,o,M,{front:M.laminateGrey});k.box(.5,.04,.2,.4,h+.02,d/2-.2,M.accent,.01);break;}
  case 'chair':chairFrame(k,M,{w,d,seatH:.46,backH:h,seat:o.room.startsWith('room-0-1')?M.fabricCharcoal:M.fabricNavy});break;
  case 'office-chair':{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;k.add(new THREE.BoxGeometry(.3,.03,.04),M.blackPlastic,Math.cos(a)*.15,.07,Math.sin(a)*.15,0,-a,0);k.sphere(.025,Math.cos(a)*.29,.03,Math.sin(a)*.29,M.blackPlastic);}
   k.cyl(.025,.025,.3,0,.24,0,M.metal,10);k.box(.5,.08,.48,0,.47,.02,M.fabricCharcoal,.035);k.box(.46,h-.62,.07,0,(h+.55)/2,-.22,M.fabricCharcoal,.03);for(const s of [-1,1]){k.box(.04,.2,.04,s*.24,.6,0,M.blackPlastic);k.box(.06,.03,.25,s*.24,.71,.0,M.blackPlastic,.01);}break;}
  case 'stool':k.cyl(.19,.19,.06,0,h-.03,0,M.walnut,24);k.cyl(.025,.03,h-.06,0,(h-.06)/2,0,M.darkMetal,10);k.cyl(.17,.2,.02,0,.01,0,M.darkMetal,24);k.torus(.15,.01,0,.28,0,M.darkMetal);break;
  case 'sofa':case 'armchair':{const fab=o.type==='armchair'?M.fabricTerracotta:o.room.startsWith('room-0-4')?M.fabricNavy:M.fabricSage;const arm=.16,seatH=.43;k.box(w,.22,d,0,.11+.06,0,fab,.04);
   for(const s of [-1,1])k.box(arm,.62,d,s*(w/2-arm/2),.31+.06,0,fab,.06);k.box(w-.02,.5,.2,0,.55+.1,-d/2+.1,fab,.07);const seats=o.type==='armchair'?1:Math.max(2,Math.round((w-2*arm)/.65)),cw=(w-2*arm)/seats;
   for(let i=0;i<seats;i++){const x=-w/2+arm+cw*(i+.5);k.box(cw-.02,.14,d-.26,x,seatH-.03+.06,.06,fab,.06);k.box(cw-.04,.42,.16,x,.68,-d/2+.26,fab,.08);}
   for(const sx of [-1,1])for(const sz of [-1,1])k.cyl(.02,.015,.06,sx*(w/2-.07),.03,sz*(d/2-.07),M.walnut,8);break;}
  case 'bench':k.box(w,.05,d,0,h-.025,0,M.oakFurniture,.01);for(const s of [-1,1])k.boxMM(s*(w/2-.06)-.02,s*(w/2-.06)+.02,0,h-.05,-d/2+.04,d/2-.04,M.darkMetal);break;
  case 'base-cabinets':{casework(k,o,M,{body:M.laminate,top:M.marble,topT:.03,frontMat:M.laminateSage});k.boxMM(-w/2,w/2,h,h+.5,-d/2,-d/2+.012,M.tile);break;}
  case 'upper-cabinets':casework(k,o,M,{body:M.laminate,plinth:0,frontMat:M.laminate});k.boxMM(-w/2+.02,w/2-.02,-.01,0,-d/2,d/2-.02,M.lightPanel);break;
  case 'island':casework(k,o,M,{body:M.laminateSage,top:M.marble,topT:.04,frontMat:M.laminateSage,overhang:-.28});break;
  case 'pantry-cabinet':case 'tall-cabinet':case 'shoe-cabinet':case 'sideboard':case 'nightstand':case 'dresser':case 'wardrobe':case 'tv-console':case 'china-cabinet':
   casework(k,o,M,{body:['sideboard','tv-console'].includes(o.type)?M.walnut:M.laminate,plinth:o.type==='sideboard'?0:.06,frontMat:['sideboard','tv-console'].includes(o.type)?M.walnut:M.laminateGrey});if(o.type==='sideboard')for(const sx of [-1,1])for(const sz of [-1,1])k.cyl(.015,.015,.0001,sx*(w/2-.05),0,sz*(d/2-.05),M.darkMetal);break;
  case 'locker':casework(k,o,M,{body:M.laminateGrey,plinth:.08,frontMat:M.laminateSage});for(const p of o.parts)if(p.box)for(let y=p.box.y1-.12;y>p.box.y1-.2;y-=.025)k.boxMM(p.box.x0+.08,p.box.x1-.08,y,y+.008,p.box.z1-.004,p.box.z1+.002,M.darkMetal);break;
  case 'vanity':casework(k,o,M,{body:M.walnut,top:M.marble,topT:.04,frontMat:M.walnut});for(const s of [-1,1]){k.cyl(.19,.16,.12,s*w/4,h+.06,.02,M.porcelain,28);k.cyl(.17,.17,.005,s*w/4,h+.118,.02,M.blackPlastic,28);k.cyl(.012,.012,.2,s*w/4,h+.1,-d/2+.08,M.chrome,10);k.box(.02,.02,.14,s*w/4,h+.2,-d/2+.15,M.chrome);}break;
  case 'utility-sink':casework(k,o,M,{body:M.laminate,top:M.metal,topT:.03,frontMat:M.laminate});k.box(w-.12,.02,d-.15,0,h+.001,0,M.darkMetal);k.cyl(.012,.012,.25,0,h+.12,-d/2+.07,M.chrome,10);k.box(.02,.02,.16,0,h+.25,-d/2+.15,M.chrome);break;
  case 'server-rack':{k.boxMM(-w/2,w/2,0,h,-d/2,d/2-.02,M.darkMetal);for(const p of o.parts)if(p.box)k.boxMM(p.box.x0,p.box.x1,p.box.y0,p.box.y1,p.box.z0-.005,p.box.z1,M.rack);drawParts(k,{...o,parts:o.parts.map(p=>({...p,box:null}))},M,{handle:M.metal});k.boxMM(-w/2+.05,w/2-.05,h,h+.02,-d/2+.1,d/2-.1,M.metal);break;}
  case 'ups':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.darkMetal,.01);k.boxMM(-.08,.08,h-.2,h-.12,d/2,d/2+.005,M.led);break;
  case 'refrigerator':{k.boxMM(-w/2,w/2,0,h,-d/2,d/2-.04,M.metal,.01);for(const p of o.parts){k.boxMM(p.box.x0,p.box.x1,p.box.y0,p.box.y1,p.box.z0-.035,p.box.z1-.004,M.metal,.01);for(const c of p.children)if(c.grasp){const g=c.grasp.p;if(p.kind==='door')k.box(.02,.6,.03,g[0],g[1]-.1,g[2],M.chrome,.008);else k.box(.5,.02,.03,g[0],g[1],g[2],M.chrome,.008);}}break;}
  case 'dishwasher':k.boxMM(-w/2,w/2,.1,h,-d/2,d/2-.02,M.metal);k.boxMM(-w/2+.01,w/2-.01,h-.1,h-.02,d/2-.02,d/2,M.darkMetal);k.box(w-.12,.02,.03,0,h-.14,d/2+.02,M.chrome,.008);cast=false;break;
  case 'sink':k.boxMM(-w/2,w/2,.0,.2,-d/2,d/2,M.metal);k.boxMM(-w/2+.03,w/2-.03,.19,.2,-d/2+.03,d/2-.03,M.darkMetal);k.cyl(.018,.022,.32,.0,.36,-d/2+.06,M.chrome,12);k.torus(.11,.012,0,.52,-d/2+.17,M.chrome,0,Math.PI/2,Math.PI);break;
  case 'microwave':k.box(w,h,d,0,h/2,0,M.darkMetal,.012);k.boxMM(-w/2+.02,w/2-.13,.03,h-.03,d/2,d/2+.005,M.screenOff);k.boxMM(w/2-.11,w/2-.02,h-.12,h-.06,d/2,d/2+.005,M.led);break;
  case 'coffee-maker':k.box(w,h*.75,d*.8,0,h*.375+h*.25,-d*.1,M.darkMetal,.02);k.box(w,.04,d,0,.02,0,M.darkMetal,.01);k.cyl(.035,.03,.08,0,.08,.05,M.ceramic,14);k.box(w*.8,.05,.06,0,h*.75,d*.25,M.chrome,.01);break;
  case 'kettle':k.cyl(.07,.09,h*.8,0,h*.4+.02,0,M.metal,20);k.cyl(.09,.09,.02,0,.01,0,M.blackPlastic,20);k.torus(.06,.012,-.08,h*.55,0,M.blackPlastic,0,0,Math.PI);break;
  case 'toaster':k.box(w,h,d,0,h/2,0,M.metal,.03);k.boxMM(-w/2+.05,w/2-.05,h-.002,h+.002,-.03,-.01,M.blackPlastic);k.boxMM(-w/2+.05,w/2-.05,h-.002,h+.002,.01,.03,M.blackPlastic);break;
  case 'water-cooler':k.boxMM(-w/2,w/2,0,.95,-d/2,d/2,M.whitePlastic,.02);k.cyl(.14,.14,.4,0,1.15,0,new THREE.MeshPhysicalMaterial({color:'#9fd0ee',transparent:true,opacity:.55,roughness:.05}),20);k.box(.08,.06,.04,0,.95,d/2+.01,M.chrome);break;
  case 'vending-machine':{k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.darkMetal,.01);k.boxMM(-w/2+.05,w/2-.25,.45,h-.08,d/2,d/2+.005,M.glass);const cols=['#e85d4a','#f2b544','#5aa864','#3e7fc1','#f7f2e8'];for(let r=0;r<5;r++)for(let c=0;c<5;c++)k.box(.08,.16,.08,-w/2+.12+c*.11,.55+r*.24,d/2-.1,new THREE.MeshStandardMaterial({color:cols[(r+c)%5],roughness:.5}));k.boxMM(w/2-.2,w/2-.05,1.0,1.3,d/2,d/2+.006,M.screen);k.boxMM(-w/2+.05,w/2-.25,.15,.35,d/2,d/2+.004,M.blackPlastic);break;}
  case 'printer':{k.boxMM(-w/2,w/2,0,h-.05,-d/2,d/2-.02,M.whitePlastic,.012);k.boxMM(-w/2,w/2,0,.08,-d/2,d/2,M.darkMetal);drawParts(k,{...o,parts:o.parts.filter(p=>p.kind==='drawer')},M,{front:M.laminateGrey,handle:M.darkMetal});const lid=o.parts.find(p=>p.kind==='lid');if(lid)k.boxMM(lid.box.x0,lid.box.x1,lid.box.y0,lid.box.y1,lid.box.z0,lid.box.z1,M.laminateGrey,.008);k.boxMM(w/2-.25,w/2-.05,h-.1,h-.06,d/2-.12,d/2-.02,M.screen);k.boxMM(-w/2+.1,w/2-.3,h*.62,h*.64,-d/2+.1,d/2-.05,M.darkMetal);k.boxMM(-w/2+.15,w/2-.35,h*.64,h*.66,-d/2+.15,d/2-.15,M.paper);break;}
  case 'shredder':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.darkMetal,.02);k.boxMM(-w/2+.05,w/2-.05,h,h+.004,-.02,.02,M.blackPlastic);k.boxMM(-w/2+.04,w/2-.04,.05,h-.15,d/2,d/2+.004,M.glass);break;
  case 'whiteboard':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.metal);k.boxMM(-w/2+.02,w/2-.02,.02,h-.02,d/2-.005,d/2+.002,M.whiteboard);k.boxMM(-w/2+.2,w/2-.2,-.01,.02,d/2,d/2+.06,M.metal);cast=false;break;
  case 'tv':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.blackPlastic,.01);k.boxMM(-w/2+.015,w/2-.015,.015,h-.015,d/2,d/2+.002,M.screen);cast=false;break;
  case 'mirror':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,M.mirror);k.boxMM(-w/2-.01,w/2+.01,-.01,0,-d/2,d/2+.01,M.metal);cast=false;break;
  case 'phone-booth':{for(const sx of [-1,1])for(const sz of [-1,1])k.boxMM(sx*w/2-(sx>0?.04:0),sx*w/2+(sx<0?.04:0),0,h,sz*d/2-(sz>0?.04:0),sz*d/2+(sz<0?.04:0),M.darkMetal);
   k.boxMM(-w/2,w/2,h-.06,h,-d/2,d/2,M.laminateGrey);k.boxMM(-w/2,w/2,0,.05,-d/2,d/2,M.laminateGrey);k.boxMM(-w/2+.04,w/2-.04,.05,h-.06,-d/2+.0,-d/2+.04,M.fabricSage);for(const sx of [-1,1])k.boxMM(sx*w/2-(sx>0?.02:0),sx*w/2+(sx<0?.02:0),.05,h-.06,-d/2+.04,d/2-.04,M.glass);
   const door=o.parts[0];if(door)k.boxMM(door.box.x0,door.box.x1,door.box.y0,door.box.y1,door.box.z0,door.box.z1,M.glass);drawParts(k,{...o,parts:o.parts.map(p=>({...p,box:null}))},M);k.boxMM(-w/2+.08,w/2-.08,.72,.75,-d/2+.04,-d/2+.36,M.oakFurniture);k.cyl(.17,.17,.05,0,.45,.05,M.fabricTerracotta,18);k.cyl(.02,.02,.42,0,.21,.05,M.darkMetal,8);k.boxMM(-.25,.25,h-.07,h-.065,-.15,.15,M.lightPanel);break;}
  case 'hand-dryer':k.box(w,h,d,0,h/2,0,M.whitePlastic,.04);k.boxMM(-w/2+.04,w/2-.04,.02,.05,d/2-.02,d/2+.002,M.blackPlastic);cast=false;break;
  case 'toilet':{k.cyl(.17,.13,.38,0,.19,.06,M.porcelain,24);k.sphere(.19,0,.38,.08,M.porcelain,1,.18,1.25);k.box(.38,.36,.16,0,.6,-d/2+.1,M.porcelain,.04);k.torus(.16,.025,0,.42,.1,M.whitePlastic,Math.PI/2);const lid=o.parts.find(p=>p.kind==='lid');if(lid)k.boxMM(lid.box.x0,lid.box.x1,lid.box.y0,lid.box.y1,lid.box.z0,lid.box.z1,M.whitePlastic,.02);k.cyl(.025,.025,.012,0,.785,-d/2+.1,M.chrome);break;}
  case 'treadmill':{k.boxMM(-w/2,w/2,0,.2,-d/2,d/2,M.darkMetal,.03);k.boxMM(-w/2+.08,w/2-.08,.2,.21,-d/2+.15,d/2-.05,M.rubberBlack);for(const s of [-1,1]){k.boxMM(s*(w/2-.04)-.03,s*(w/2-.04)+.03,.2,h,-d/2+.08,-d/2+.16,M.metal);k.boxMM(s*(w/2-.04)-.025,s*(w/2-.04)+.025,1.0,1.04,-d/2+.1,-d/2+.6,M.metal);}k.boxMM(-w/2+.05,w/2-.05,h-.18,h,-d/2+.05,-d/2+.25,M.darkMetal,.02);k.boxMM(-.2,.2,h-.15,h-.03,-d/2+.25,-d/2+.255,M.screen);break;}
  case 'exercise-bike':{k.cyl(.22,.22,.06,0,.32,-.25,M.darkMetal,28,0,Math.PI/2);k.box(.08,.06,1.0,0,.05,0,M.darkMetal,.02);k.add(new THREE.CylinderGeometry(.03,.03,.8,8),M.metal,0,.45,.12,.35);k.box(.22,.07,.28,0,.95,.32,M.fabricCharcoal,.03);k.add(new THREE.CylinderGeometry(.025,.025,.9,8),M.metal,0,.65,-.3,-.25);k.box(.5,.03,.05,0,1.12,-.42,M.blackPlastic,.01);break;}
  case 'weight-bench':k.box(w,.1,.3,0,h-.05,0,M.fabricCharcoal,.04);for(const s of [-1,1])k.boxMM(s*(w/2-.15)-.03,s*(w/2-.15)+.03,0,h-.1,-d/2,d/2,M.darkMetal);break;
  case 'dumbbell-rack':for(const [y,z]of [[.45,.05],[.75,-.05]])k.boxMM(-w/2,w/2,y,y+.04,z-.12,z+.12,M.darkMetal);for(const s of [-1,1])k.boxMM(s*(w/2-.03)-.03,s*(w/2-.03)+.03,0,h,-d/2,d/2,M.darkMetal);break;
  case 'dumbbells':for(let i=0;i<5;i++){const x=-w/2+.09+i*.18;k.cyl(.04+i*.004,.04+i*.004,.04,x,.05,-.06,M.rubberBlack,14,0,Math.PI/2);k.cyl(.012,.012,.18,x,.05,0,M.chrome,8,Math.PI/2);k.cyl(.04+i*.004,.04+i*.004,.04,x,.05,.06,M.rubberBlack,14,0,Math.PI/2);}break;
  case 'bookshelf':{k.boxMM(-w/2,w/2,0,h,-d/2,-d/2+.015,M.walnut);for(const s of [-1,1])k.boxMM(s*w/2-(s>0?.025:0),s*w/2+(s<0?.025:0),0,h,-d/2,d/2,M.walnut);const n=Math.max(3,Math.round(h/.36));for(let i=0;i<=n;i++){const y=i*(h-.025)/n;k.boxMM(-w/2,w/2,y,y+.025,-d/2,d/2,M.walnut);if(i<n)books(k,M,-w/2+.03,w/2-.03,y+.025,-d/2+.02,d/2-.02,i*7+Math.round(w*10));}break;}
  case 'shelf-unit':{for(const sx of [-1,1])for(const sz of [-1,1])k.boxMM(sx*w/2-(sx>0?.03:0),sx*w/2+(sx<0?.03:0),0,h,sz*d/2-(sz>0?.03:0),sz*d/2+(sz<0?.03:0),M.metal);for(let i=0;i<5;i++){const y=.08+i*(h-.1)/4;k.boxMM(-w/2,w/2,y,y+.02,-d/2,d/2,M.laminateGrey);if(i<4)for(let j=0;j<Math.floor(w/.32);j++)k.box(.26,.18+((i+j)%3)*.04,d*.75,-w/2+.18+j*.32,y+.12,0,[M.paper,M.laminateSage,M.fabricTerracotta][(i+j)%3],.01);}break;}
  case 'trash-bin':k.cyl(w/2,w/2*.9,h,0,h/2,0,o.id.includes('recycl')||o.id.includes('paper')?M.laminateSage:M.metal,22);k.cyl(w/2+.01,w/2+.01,.03,0,h,0,M.darkMetal,22);break;
  case 'bin':{const cols=['#3e7fc1','#f2b544','#5aa864'];for(let i=0;i<3;i++)k.boxMM(-w/2+i*w/3+.01,-w/2+(i+1)*w/3-.01,0,h,-d/2,d/2,new THREE.MeshStandardMaterial({color:cols[i],roughness:.5}),.02);k.boxMM(-w/2,w/2,h,h+.03,-d/2,d/2,M.darkMetal);break;}
  case 'dock':k.boxMM(-w/2,w/2,0,.03,-d/2,d/2+.25,M.darkMetal,.01);k.boxMM(-w/2,w/2,0,h,-d/2,-d/2+.12,M.whitePlastic,.03);for(const s of [-1,1])k.boxMM(s*.09-.02,s*.09+.02,.06,.1,-d/2+.12,-d/2+.14,M.chrome);k.boxMM(-.1,.1,h-.05,h-.03,-d/2+.12,-d/2+.125,M.led);break;
  case 'plant':plant(k,M,{h,r:Math.min(w,d)*.45});break;
  case 'rug':k.boxMM(-w/2,w/2,0,h,-d/2,d/2,o.id.includes('runner')?M.fabricCharcoal:o.id.includes('mat')?M.rubberBlack:M.fabricTerracotta);cast=false;break;
  case 'coat-rack':k.cyl(.02,.02,h,0,h/2,0,M.walnut,10);k.cyl(.2,.22,.03,0,.015,0,M.walnut,20);for(let i=0;i<4;i++){const a=i*Math.PI/2;k.add(new THREE.CylinderGeometry(.01,.01,.18,6),M.metal,Math.cos(a)*.07,h-.12,Math.sin(a)*.07,Math.cos(a)*.8,0,Math.sin(a)*.8);}k.box(.3,.5,.12,.08,h-.45,0,M.fabricNavy,.05);break;
  case 'umbrella-stand':k.cyl(w/2,w/2*.9,h,0,h/2,0,M.darkMetal,18);k.cyl(.012,.012,.5,.03,h+.15,0,M.blackPlastic,6);break;
  case 'vacuum':k.box(.28,.1,.3,0,.05,0,M.darkMetal,.03);k.cyl(.02,.02,.95,0,.55,-.05,M.metal,8);k.box(.18,.35,.14,0,.45,-.04,M.fabricTerracotta,.04);break;
  case 'mop-bucket':k.cyl(.15,.13,.28,0,.14,0,M.laminateSage,18);k.cyl(.012,.012,1.2,.05,.6,0,M.metal,6,0,.08);break;
  case 'laundry-basket':k.cyl(w/2,w/2*.85,h,0,h/2,0,M.fabric,18);break;
  case 'floor-lamp':k.cyl(.14,.16,.03,0,.015,0,M.darkMetal,20);k.cyl(.012,.012,h-.3,0,(h-.3)/2,0,M.darkMetal,8);k.cyl(.14,.2,.28,0,h-.14,0,new THREE.MeshStandardMaterial({color:'#f4ecd8',emissive:'#ffdca0',emissiveIntensity:.6,roughness:.9}),20);break;
  case 'table-lamp':k.cyl(.07,.08,.04,0,.02,0,M.ceramic,16);k.cyl(.012,.012,h*.5,0,h*.27,0,M.metal,8);k.cyl(.09,.12,h*.45,0,h*.75,0,new THREE.MeshStandardMaterial({color:'#f4ecd8',emissive:'#ffdca0',emissiveIntensity:.6,roughness:.9}),18);break;
  case 'monitor':k.box(.18,.015,.14,0,.008,-.02,M.darkMetal,.004);k.box(.03,h*.55,.025,0,h*.3,-.05,M.darkMetal);k.boxMM(-w/2,w/2,h*.28,h,-.03,-.005,M.blackPlastic,.005);k.boxMM(-w/2+.01,w/2-.01,h*.28+.01,h-.01,-.005,-.002,M.screen);break;
  case 'keyboard':k.box(w,h,d,0,h/2,0,M.darkMetal,.004);break;
  case 'laptop':k.box(w,.015,d,0,.008,0,M.metal,.004);k.add(new THREE.BoxGeometry(w,d*.95,.008),M.screen,0,.015+d*.45*Math.cos(.35),-d/2+d*.45*Math.sin(.35)*.3,-.35);break;
  case 'mug':k.cyl(.04,.035,.095,0,.048,0,M.ceramic,16);k.torus(.025,.007,.045,.05,0,M.ceramic,0,0);break;
  case 'cup':k.cyl(.035,.03,.11,0,.055,0,M.glass,16);break;
  case 'plate-stack':for(let i=0;i<5;i++)k.cyl(.12,.1,.012,0,.006+i*.013,0,M.ceramic,24);break;
  case 'bowl':case 'fruit-bowl':k.lathe([[0,0],[w*.25,0],[w*.45,h*.6],[w*.5,h]],0,0,0,M.ceramic,24);if(o.type==='fruit-bowl'){const cols=['#e8a04f','#c94b3b','#9cc45a'];for(let i=0;i<5;i++)k.sphere(.04,Math.cos(i*1.3)*.06,h*.7,Math.sin(i*1.3)*.06,new THREE.MeshStandardMaterial({color:cols[i%3],roughness:.6}));}break;
  case 'dish-rack':k.boxMM(-w/2,w/2,0,.02,-d/2,d/2,M.metal);for(let i=0;i<6;i++)k.boxMM(-w/2+.05+i*.07,-w/2+.055+i*.07,.02,h,-d/2,d/2,M.metal);break;
  case 'utensil-holder':k.cyl(.05,.05,.14,0,.07,0,M.metal,16);for(let i=0;i<5;i++)k.cyl(.006,.006,.2,Math.cos(i)*.02,.2,Math.sin(i)*.02,i%2?M.walnut:M.blackPlastic,6);break;
  case 'cutting-board':k.box(w,h,d,0,h/2,0,M.oakFurniture,.008);break;
  case 'books':case 'paper-ream':{const n=Math.max(1,Math.round(h/.03));for(let i=0;i<n;i++)k.box(w*(.9+((i*7)%3)*.05),h/n-.003,d*(.9+((i*5)%3)*.04),((i*13)%5-2)*.005,h/n*(i+.5),0,o.type==='paper-ream'?M.paper:M.books[i%M.books.length],.003);break;}
  case 'vase':k.lathe([[0,0],[w*.4,0],[w*.5,h*.35],[w*.3,h*.8],[w*.35,h]],0,0,0,o.id.includes('carafe')?M.glass:M.ceramic,20);break;
  case 'conference-phone':k.cyl(w/2,w/2,h,0,h/2,0,M.darkMetal,3);k.cyl(.03,.03,.004,0,h,0,M.led,12);break;
  case 'key-bowl':k.lathe([[0,0],[w*.3,0],[w*.5,h]],0,0,0,M.walnut,20);break;
  case 'toiletries':k.cyl(.04,.04,.15,0,.075,0,M.whitePlastic,14);k.box(.02,.02,.05,0,.17,.02,M.chrome);break;
  case 'towel':k.box(w,h,d,0,h/2,0,M.fabric,.01);cast=false;break;
  case 'towel-rack':for(let i=0;i<4;i++)k.cyl(.01,.01,w,0,.05+i*.12,0,M.chrome,8,0,Math.PI/2);for(const s of [-1,1])k.box(.02,h,.02,s*w/2,h/2,0,M.chrome);cast=false;break;
  case 'hub':k.box(w,h,d,0,h/2,0,M.whitePlastic,.015);k.cyl(.035,.035,.004,0,h/2,d/2+.001,M.led,18,Math.PI/2);cast=false;break;
  case 'switch':case 'outlet':k.box(w,h,d,0,h/2,0,M.whitePlastic,.004);if(o.type==='outlet')for(const s of [-1,1])k.box(.008,.016,.004,s*.012,h/2,d/2+.001,M.blackPlastic);cast=false;break;
  case 'trash':k.add(new THREE.IcosahedronGeometry(.06,0),M.paper,-.05,.05,0,.3,.6,.1);k.cyl(.033,.033,.12,.07,.033,.03,M.metal,14,Math.PI/2);k.add(new THREE.IcosahedronGeometry(.045,0),M.litter,.0,.04,.08,1,.2,.4);break;
  case 'surface':k.add(new THREE.CylinderGeometry(.5,.5,.004,28),M.spill,0,.003,0,0,0,0,w,1,d);cast=false;break;
  case 'pet-bed':k.cyl(w/2,w/2,h*.6,0,h*.3,0,M.fabricCharcoal,24);k.cyl(w/2-.08,w/2-.08,h*.5,0,h*.4,0,M.fabric,24);break;
  case 'stairs':case 'elevator':cast=false;break;
  default:k.box(w,h,d,0,h/2,0,M.laminateGrey,.01);
 }
 const g=k.build({cast});g.userData.objectId=o.id;return g;
}
