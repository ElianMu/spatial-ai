// Procedural PBR material library. Every texture is generated on a canvas at start-up, so the
// project keeps zero asset downloads and no paid services. Textures are authored in metres:
// geometry UVs are written in metres (see metricUV in scene.mjs) and `tile` is the repeat size.
import * as THREE from 'three';

function canvas(size,draw){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');draw(g,size);return c;}
function rand(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function noise(g,n,alpha,colours,r,size,min=1,max=3){for(let i=0;i<n;i++){g.globalAlpha=alpha*(.4+r()*.6);g.fillStyle=colours[Math.floor(r()*colours.length)];const s=min+r()*(max-min);g.fillRect(r()*size,r()*size,s,s);}g.globalAlpha=1;}

const PAINTERS={
 oak:(g,S)=>{const r=rand(3);g.fillStyle='#b48a5f';g.fillRect(0,0,S,S);const plank=S/6;for(let i=0;i<6;i++){const tone=['#b98f63','#a97f55','#c19a6e','#ad845b','#b68c60','#c5a073'][i];g.fillStyle=tone;g.fillRect(0,i*plank,S,plank-2);const off=r()*S;g.fillStyle='rgba(60,35,15,.35)';g.fillRect(off,i*plank,2,plank);for(let k=0;k<26;k++){g.strokeStyle=`rgba(90,55,25,${.05+r()*.12})`;g.lineWidth=.6+r();g.beginPath();const y=i*plank+r()*plank;g.moveTo(0,y);for(let x=0;x<=S;x+=S/8)g.lineTo(x,y+Math.sin(x*.02+k)*2+r()*1.5);g.stroke();}}g.fillStyle='rgba(40,25,10,.5)';for(let i=1;i<6;i++)g.fillRect(0,i*plank-2,S,2);},
 carpet:(g,S)=>{const r=rand(5);g.fillStyle='#6f757b';g.fillRect(0,0,S,S);noise(g,26000,.35,['#5d636a','#80868b','#686e75','#757e88'],r,S,1,2);g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,S,2);g.fillRect(0,0,2,S);g.fillStyle='rgba(255,255,255,.05)';for(let i=0;i<S;i+=4)g.fillRect(0,i,S,1);},
 carpetBlue:(g,S)=>{const r=rand(6);g.fillStyle='#3f4e62';g.fillRect(0,0,S,S);noise(g,26000,.35,['#34425a','#4b5c74','#3a4a5f','#56677c'],r,S,1,2);g.fillStyle='rgba(0,0,0,.2)';g.fillRect(0,0,S,2);g.fillRect(0,0,2,S);},
 terrazzo:(g,S)=>{const r=rand(9);g.fillStyle='#dcd8cf';g.fillRect(0,0,S,S);noise(g,2600,.9,['#9a948a','#b8b0a2','#8a8478','#c9c3b8','#6f6a63','#d8a98a'],r,S,2,6);noise(g,8000,.25,['#cfcabe','#e6e2d9'],r,S,1,2);},
 tile:(g,S)=>{g.fillStyle='#e9e8e3';g.fillRect(0,0,S,S);const r=rand(4);noise(g,6000,.12,['#d6d5cf','#f4f3ef'],r,S,1,3);g.fillStyle='#b7b5ae';const n=4;for(let i=0;i<=n;i++){g.fillRect(i*S/n-1,0,2,S);g.fillRect(0,i*S/n-1,S,2);}},
 marble:(g,S)=>{const r=rand(12);g.fillStyle='#ecebe7';g.fillRect(0,0,S,S);for(let k=0;k<14;k++){g.strokeStyle=`rgba(120,118,112,${.08+r()*.22})`;g.lineWidth=.6+r()*2.2;g.beginPath();let x=r()*S,y=0;g.moveTo(x,y);while(y<S){x+=(r()-.5)*40;y+=10+r()*25;g.lineTo(x,y);}g.stroke();}noise(g,3000,.06,['#d0cfca'],r,S,1,4);},
 concrete:(g,S)=>{const r=rand(7);g.fillStyle='#b9b7b1';g.fillRect(0,0,S,S);noise(g,20000,.18,['#a9a7a1','#c8c6c0','#9d9b95'],r,S,1,4);},
 paint:(g,S)=>{const r=rand(8);g.fillStyle='#f2f0eb';g.fillRect(0,0,S,S);noise(g,9000,.05,['#e6e4de','#faf9f6'],r,S,1,3);},
 fabric:(g,S)=>{g.fillStyle='#8a8f8c';g.fillRect(0,0,S,S);for(let i=0;i<S;i+=3){g.fillStyle=`rgba(255,255,255,${i%6?.05:.09})`;g.fillRect(i,0,1,S);g.fillStyle=`rgba(0,0,0,${i%6?.05:.08})`;g.fillRect(0,i,S,1);}const r=rand(2);noise(g,6000,.1,['#6f7471','#a3a8a5'],r,S,1,2);},
 walnut:(g,S)=>{const r=rand(13);g.fillStyle='#6b4a33';g.fillRect(0,0,S,S);for(let k=0;k<70;k++){g.strokeStyle=`rgba(${30+r()*30},${18+r()*15},10,${.08+r()*.18})`;g.lineWidth=.5+r()*1.5;g.beginPath();const y=r()*S;g.moveTo(0,y);for(let x=0;x<=S;x+=S/10)g.lineTo(x,y+Math.sin(x*.03+k)*3);g.stroke();}},
 rubber:(g,S)=>{const r=rand(10);g.fillStyle='#6d7470';g.fillRect(0,0,S,S);noise(g,9000,.5,['#7f8781','#5f6662','#8d968f','#76877d'],r,S,1,3);},
 raised:(g,S)=>{g.fillStyle='#c5c8c9';g.fillRect(0,0,S,S);const r=rand(11);noise(g,8000,.12,['#b3b6b8','#d3d6d7'],r,S,1,3);g.fillStyle='#8d9193';g.fillRect(0,0,S,3);g.fillRect(0,0,3,S);for(const [x,y]of [[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){g.beginPath();g.arc(x*S,y*S,6,0,7);g.fillStyle='#a2a6a8';g.fill();}},
 whiteboard:(g,S)=>{g.fillStyle='#f7f8f8';g.fillRect(0,0,S,S);g.strokeStyle='rgba(40,90,170,.55)';g.lineWidth=3;g.beginPath();g.moveTo(60,120);g.bezierCurveTo(140,60,220,190,320,110);g.stroke();g.strokeStyle='rgba(200,60,50,.5)';for(let i=0;i<5;i++){g.strokeRect(70+i*70,250,50,30);}g.fillStyle='rgba(30,30,30,.45)';g.font='26px sans-serif';g.fillText('Q4 roadmap',70,400);},
 screen:(g,S)=>{const grd=g.createLinearGradient(0,0,S,S);grd.addColorStop(0,'#1d3b4f');grd.addColorStop(1,'#0e1820');g.fillStyle=grd;g.fillRect(0,0,S,S);g.fillStyle='rgba(120,200,220,.35)';for(let i=0;i<9;i++)g.fillRect(40,60+i*42,120+((i*73)%260),10);},
 rack:(g,S)=>{g.fillStyle='#1d2124';g.fillRect(0,0,S,S);for(let y=8;y<S;y+=10)for(let x=8;x<S;x+=10){g.fillStyle='#0a0c0d';g.fillRect(x,y,5,5);}const r=rand(3);for(let i=0;i<60;i++){g.fillStyle=r()>.5?'#3fdc8a':'#e8b546';g.fillRect(r()*S,r()*S,3,3);}},
};
const cache=new Map();
function texture(name,{tile=1,bump=false}={}){const k=name;if(!cache.has(k)){const t=new THREE.CanvasTexture(canvas(512,PAINTERS[name]));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;cache.set(k,t);}const t=cache.get(k).clone();t.needsUpdate=true;t.repeat.set(1/tile,1/tile);return t;}

export function createMaterials(maxAnisotropy=8){
 const std=(o)=>new THREE.MeshStandardMaterial({envMapIntensity:.9,...o});
 const tex=(name,tile,{bump,...o}={})=>{const map=texture(name,{tile});map.anisotropy=maxAnisotropy;const m=std({map,...o});if(bump){m.bumpMap=map;m.bumpScale=bump;}return m;};
 const M={
  oak:tex('oak',1.2,{roughness:.55,bump:.6}),carpet:tex('carpet',.5,{roughness:.95,bump:.8}),carpetBlue:tex('carpetBlue',.5,{roughness:.95,bump:.8}),terrazzo:tex('terrazzo',1.4,{roughness:.32}),tile:tex('tile',1.2,{roughness:.28}),
  marble:tex('marble',1.6,{roughness:.18}),concrete:tex('concrete',2,{roughness:.85}),paint:tex('paint',2,{roughness:.88}),rubber:tex('rubber',1,{roughness:.9}),raised:tex('raised',.6,{roughness:.7}),
  fabric:tex('fabric',.25,{color:'#b9beb9',roughness:.95,bump:.5}),fabricSage:tex('fabric',.25,{color:'#9bb5a2',roughness:.95,bump:.5}),fabricNavy:tex('fabric',.25,{color:'#6f86b0',roughness:.95,bump:.5}),fabricTerracotta:tex('fabric',.25,{color:'#dca383',roughness:.95,bump:.5}),fabricCharcoal:tex('fabric',.25,{color:'#5c6064',roughness:.95,bump:.5}),
  walnut:tex('walnut',.9,{roughness:.45}),oakFurniture:tex('oak',.9,{roughness:.5}),
  laminate:std({color:'#f3f2ee',roughness:.38}),laminateGrey:std({color:'#c9cbc9',roughness:.42}),laminateSage:std({color:'#9fb3a3',roughness:.45}),
  metal:std({color:'#c7c9cb',metalness:.85,roughness:.32}),darkMetal:std({color:'#3b3f43',metalness:.6,roughness:.45}),blackPlastic:std({color:'#202326',roughness:.55}),whitePlastic:std({color:'#eceeed',roughness:.35}),
  chrome:std({color:'#e9ecef',metalness:1,roughness:.08}),porcelain:std({color:'#f7f7f4',roughness:.12}),ceramic:std({color:'#efeae2',roughness:.25}),
  glass:new THREE.MeshPhysicalMaterial({color:'#dcebee',metalness:0,roughness:.04,transmission:0,transparent:true,opacity:.22,envMapIntensity:1.6,depthWrite:false}),
  mirror:std({color:'#dfe7ea',metalness:1,roughness:.03}),
  screen:std({map:texture('screen'),emissive:'#284a5c',emissiveIntensity:.6,roughness:.2}),screenOff:std({color:'#121518',roughness:.15,metalness:.2}),
  whiteboard:std({map:texture('whiteboard'),roughness:.15}),rack:std({map:texture('rack'),roughness:.4,metalness:.4,emissive:'#ffffff',emissiveMap:texture('rack'),emissiveIntensity:.25}),
  wallPaint:tex('paint',2,{roughness:.9}),wallAccent:std({color:'#c7d3c8',roughness:.9}),trim:std({color:'#f7f6f2',roughness:.5}),cap:std({color:'#3d4743',roughness:.9}),
  doorWood:tex('oak',.9,{roughness:.45}),frame:std({color:'#eceae4',roughness:.45}),windowFrame:std({color:'#3a3f43',metalness:.5,roughness:.4}),
  plantLeaf:std({color:'#4e7a4a',roughness:.75}),plantLeafLight:std({color:'#6b9a5b',roughness:.75}),pot:std({color:'#d8d2c6',roughness:.6}),soil:std({color:'#3d2f25',roughness:1}),
  blind:std({color:'#e7e3d9',roughness:.95,side:THREE.DoubleSide}),ceiling:std({color:'#f6f5f1',roughness:.95}),lightPanel:std({color:'#ffffff',emissive:'#fff2d8',emissiveIntensity:1.4}),
  spill:new THREE.MeshPhysicalMaterial({color:'#9c7a5a',roughness:.05,metalness:0,clearcoat:1,transparent:true,opacity:.75}),litter:std({color:'#d6c7a8',roughness:.9}),
  rubberBlack:std({color:'#1b1d1f',roughness:.85}),paper:std({color:'#fbfaf6',roughness:.9}),books:[std({color:'#6d8fb2',roughness:.8}),std({color:'#c96f5a',roughness:.8}),std({color:'#e2c27d',roughness:.8}),std({color:'#7da38a',roughness:.8}),std({color:'#3d4a5c',roughness:.8}),std({color:'#e9e4d9',roughness:.8})],
  accent:std({color:'#2c6756',roughness:.5}),led:std({color:'#55ebbd',emissive:'#55ebbd',emissiveIntensity:2}),
 };
 return M;
}
export const FLOOR_FINISH={workspace:'carpet',meeting:'carpetBlue',pantry:'tile',print:'concrete',reception:'terrazzo',lounge:'oak',office:'oak',server:'raised',restroom:'tile',wellness:'rubber',corridor:'terrazzo'};
export const CATEGORY_COLOURS={seating:'#e6a25b',table:'#c99b6d',storage:'#8aa6c1',appliance:'#d17d6b','small-appliance':'#dd8d7a',fixture:'#7fb8c9',electronics:'#9b8fd1',decor:'#c7b2d6',plant:'#7fb878',textile:'#d8c7a7',lighting:'#f0d071',sanitary:'#86c3d6',fitness:'#e58fa6',cleaning:'#a9c47f',tableware:'#e7b98c','office-equipment':'#5fb3a5','it-equipment':'#6c8fbf','office-supply':'#d4d08e','smart-home':'#5dd6b0',litter:'#d9534f',spill:'#c9302c','robot-infrastructure':'#2c6756',door:'#b38b59',window:'#9fc7d6',electrical:'#f0b45b',circulation:'#999',food:'#e8a04f',toiletry:'#a4d4e2'};
export const ROOM_COLOURS={workspace:'#8fb6d9',meeting:'#a99ad6',pantry:'#e4b47c',print:'#b7c48a',reception:'#e3a3a0',lounge:'#e5cf7a',office:'#88c5b0',server:'#8899b8',restroom:'#93cfe0',wellness:'#e79bb8',corridor:'#c9c9c0',unknown:'#bbbbbb'};
