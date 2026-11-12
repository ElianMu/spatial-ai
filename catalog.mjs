// Workplace object catalog: one source of truth for geometry, colliders, semantics and parts.
// Units are metres. Local frame: x = width (along the wall for wall-backed items), z = depth
// (the "front" face is +z), y = up from the object's base. rot is a rotation about +y applied
// exactly like THREE.Object3D.rotation.y, restricted to multiples of 90 degrees so that every
// world-space collider is an axis-aligned box.

export const ROT={S:0,N:Math.PI,E:Math.PI/2,W:-Math.PI/2}; // direction the front faces
const box=(x0,x1,y0,y1,z0,z1)=>({x0,x1,y0,y1,z0,z1});
const full=o=>[box(-o.size.w/2,o.size.w/2,0,o.size.h,-o.size.d/2,o.size.d/2)];
function tableColliders(o){const {w,d,h}=o.size,t=.04,l=.05,i=.06;return [box(-w/2,w/2,h-t,h,-d/2,d/2),...[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz])=>box(sx*(w/2-i)-l/2,sx*(w/2-i)+l/2,0,h-t,sz*(d/2-i)-l/2,sz*(d/2-i)+l/2))];}

// Articulated fronts: columns of drawers or hinged doors across the front face.
function fronts(o,columns,{y0=.1,y1=null,inset=.01}={}){
 const {w,d,h}=o.size,top=y1??h-.04,parts=[];let x=-w/2,n=0;
 for(const col of columns){const cw=col.w??w/columns.length,cx0=x+inset,cx1=x+cw-inset;x+=cw;if(col.kind==='gap')continue;
  if(col.kind==='drawers'){const rows=col.n??3,rh=(top-y0)/rows;for(let r=0;r<rows;r++){const yy0=y0+r*rh+inset,yy1=y0+(r+1)*rh-inset,id=`${o.id}:drawer-${++n}`,hy=(yy0+yy1)/2+(rh>.3?rh*.25:0);
    parts.push({id,level:'object',kind:'drawer',name:'Drawer',joint:'prismatic',axis:[0,0,1],travel:Math.min(.45,d*.8),box:box(cx0,cx1,yy0,yy1,d/2,d/2+.02),
     children:[{id:`${id}:handle`,level:'part',kind:'handle',name:'Drawer handle',box:box((cx0+cx1)/2-.08,(cx0+cx1)/2+.08,hy-.01,hy+.01,d/2+.02,d/2+.045),grasp:{p:[(cx0+cx1)/2,hy,d/2+.035],approach:[0,0,1]}}]});}}
  else if(col.kind==='doors'||col.kind==='door'){const count=col.kind==='doors'?2:1,dw=(cx1-cx0)/count;for(let k=0;k<count;k++){const a=cx0+k*dw,b=a+dw,hinge=count===2?(k===0?'left':'right'):(col.hinge??'left'),id=`${o.id}:door-${++n}`,hx=hinge==='left'?b-.05:a+.05,hy=Math.min(top-.12,(y0+top)/2+(top-y0)*.3);
    parts.push({id,level:'object',kind:'door',name:col.name??'Cabinet door',joint:'revolute',hinge,axis:[0,1,0],limit:[0,Math.PI*.55],box:box(a,b,y0+inset,top-inset,d/2,d/2+.02),
     children:[{id:`${id}:hinge`,level:'part',kind:'hinge',name:'Hinge',box:box(hinge==='left'?a-.005:b-.015,hinge==='left'?a+.015:b+.005,y0+.08,y0+.16,d/2,d/2+.02)},{id:`${id}:handle`,level:'part',kind:'handle',name:'Door handle',box:box(hx-.01,hx+.01,hy-.07,hy+.07,d/2+.02,d/2+.045),grasp:{p:[hx,hy,d/2+.035],approach:[0,0,1]}}]});}}
 }
 return parts;
}
const handlePart=(o,name,p,approach=[0,0,1],kind='handle')=>({id:`${o.id}:${kind}`,level:'part',kind,name,box:box(p[0]-.04,p[0]+.04,p[1]-.04,p[1]+.04,p[2]-.02,p[2]+.02),grasp:{p,approach}});

// category, mobility (fixed | heavy | movable), affordances, zone anchor label, colliders and parts.
export const TYPES={
 sofa:{category:'seating',mobility:'heavy',affordances:['sit','lie'],zone:'Lounge seating'},
 armchair:{category:'seating',mobility:'heavy',affordances:['sit']},
 chair:{category:'seating',mobility:'movable',affordances:['sit','push','pull']},
 stool:{category:'seating',mobility:'movable',affordances:['sit','push']},
 'office-chair':{category:'seating',mobility:'movable',affordances:['sit','push','roll']},
 bench:{category:'seating',mobility:'heavy',affordances:['sit','place-on']},
 'coffee-table':{category:'table',mobility:'heavy',affordances:['place-on'],colliders:tableColliders},
 'side-table':{category:'table',mobility:'movable',affordances:['place-on'],colliders:tableColliders},
 'dining-table':{category:'table',mobility:'heavy',affordances:['place-on','eat-at'],colliders:tableColliders,zone:'Dining area'},
 desk:{category:'table',mobility:'heavy',affordances:['place-on','work-at'],zone:'Executive desk',parts:o=>fronts(o,[{w:o.size.w-.45,kind:'gap'},{w:.45,kind:'drawers',n:2}],{y0:o.size.h-.3,y1:o.size.h-.05})},
 console:{category:'table',mobility:'heavy',affordances:['place-on'],colliders:tableColliders},
 'tv-console':{category:'storage',mobility:'heavy',affordances:['place-on','store','open'],zone:'Media wall',parts:o=>fronts(o,[{kind:'door'},{kind:'drawers',n:1},{kind:'drawers',n:1},{kind:'door',hinge:'right'}],{y0:.08})},
 tv:{category:'electronics',mobility:'movable',affordances:['switch-on','look-at'],interactiveOnly:true},
 bookshelf:{category:'storage',mobility:'heavy',affordances:['store','place-on'],zone:'Reading corner'},
 sideboard:{category:'storage',mobility:'heavy',affordances:['store','place-on','open'],parts:o=>fronts(o,[{kind:'doors'},{kind:'doors'}])},
 'china-cabinet':{category:'storage',mobility:'heavy',affordances:['store','open'],parts:o=>fronts(o,[{kind:'doors',name:'Glass door'}],{y0:.95})},
 'base-cabinets':{category:'storage',mobility:'fixed',affordances:['store','open','place-on','prepare-food'],zone:'Countertop area'},
 'upper-cabinets':{category:'storage',mobility:'fixed',affordances:['store','open'],parts:o=>fronts(o,Array.from({length:Math.max(1,Math.round(o.size.w/.6))},()=>({kind:'door'})),{y0:.02,y1:o.size.h-.02})},
 'pantry-cabinet':{category:'storage',mobility:'fixed',affordances:['store','open'],parts:o=>fronts(o,[{kind:'doors',name:'Pantry door'}],{y0:.1})},
 island:{category:'storage',mobility:'fixed',affordances:['place-on','store','open','eat-at'],zone:'High table',parts:o=>fronts(o,[{kind:'drawers',n:3},{kind:'doors'},{kind:'drawers',n:3}])},
 refrigerator:{category:'appliance',mobility:'heavy',affordances:['open','store','cool'],zone:'Cold storage',parts:o=>{const {w,d,h}=o.size;return [{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Refrigerator door',joint:'revolute',hinge:'right',axis:[0,1,0],limit:[0,2],box:box(-w/2+.01,w/2-.01,.62,h-.01,d/2,d/2+.04),children:[handlePart({id:`${o.id}:door-1`},'Refrigerator handle',[-w/2+.08,1.25,d/2+.08])]},{id:`${o.id}:drawer-1`,level:'object',kind:'drawer',name:'Freezer drawer',joint:'prismatic',axis:[0,0,1],travel:.5,box:box(-w/2+.01,w/2-.01,.04,.6,d/2,d/2+.04),children:[handlePart({id:`${o.id}:drawer-1`},'Freezer handle',[0,.52,d/2+.08])]}];}},
 range:{category:'appliance',mobility:'fixed',affordances:['cook','heat','open'],zone:'Cooking zone',parts:o=>{const {w,d,h}=o.size;return [{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Oven door',joint:'revolute',hinge:'bottom',axis:[1,0,0],limit:[0,1.55],box:box(-w/2+.02,w/2-.02,.1,h-.14,d/2,d/2+.03),children:[handlePart({id:`${o.id}:door-1`},'Oven handle',[0,h-.2,d/2+.07])]},...[-1,-.5,.5,1].map((s,i)=>({id:`${o.id}:knob-${i+1}`,level:'part',kind:'knob',name:'Burner knob',box:box(s*w*.38-.02,s*w*.38+.02,h-.08,h-.04,d/2-.02,d/2+.02),grasp:{p:[s*w*.38,h-.06,d/2+.02],approach:[0,0,1]}}))];}},
 'range-hood':{category:'appliance',mobility:'fixed',affordances:['switch-on']},
 dishwasher:{category:'appliance',mobility:'fixed',affordances:['open','wash','load'],zone:'Cleanup zone',parts:o=>{const {w,d,h}=o.size;return [{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Dishwasher door',joint:'revolute',hinge:'bottom',axis:[1,0,0],limit:[0,1.5],box:box(-w/2+.01,w/2-.01,.1,h-.05,d/2,d/2+.02),children:[handlePart({id:`${o.id}:door-1`},'Dishwasher handle',[0,h-.12,d/2+.05])]}];}},
 microwave:{category:'appliance',mobility:'movable',affordances:['open','heat'],parts:o=>{const {w,d,h}=o.size;return [{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Microwave door',joint:'revolute',hinge:'left',axis:[0,1,0],limit:[0,1.6],box:box(-w/2+.01,w/2-.12,.02,h-.02,d/2,d/2+.02),children:[handlePart({id:`${o.id}:door-1`},'Microwave handle',[w/2-.15,h/2,d/2+.03])]}];}},
 sink:{category:'fixture',mobility:'fixed',affordances:['wash','fill-water'],zone:'Cleanup zone',parts:o=>[handlePart(o,'Faucet lever',[0,.12,-o.size.d/2+.06],[0,1,0],'faucet')]},
 washer:{category:'appliance',mobility:'heavy',affordances:['open','wash','load'],zone:'Laundry area',parts:o=>[{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Washer door',joint:'revolute',hinge:'left',axis:[0,1,0],limit:[0,1.7],box:box(-.22,.22,.22,.66,o.size.d/2,o.size.d/2+.05),children:[handlePart({id:`${o.id}:door-1`},'Washer door handle',[.18,.44,o.size.d/2+.07])]}]},
 dryer:{category:'appliance',mobility:'heavy',affordances:['open','dry','load'],parts:o=>[{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Dryer door',joint:'revolute',hinge:'left',axis:[0,1,0],limit:[0,1.7],box:box(-.22,.22,.22,.66,o.size.d/2,o.size.d/2+.05),children:[handlePart({id:`${o.id}:door-1`},'Dryer door handle',[.18,.44,o.size.d/2+.07])]}]},
 'utility-sink':{category:'fixture',mobility:'fixed',affordances:['wash','fill-water'],parts:o=>[...fronts(o,[{kind:'doors'}],{y0:.08,y1:o.size.h-.2}),handlePart(o,'Faucet lever',[0,o.size.h+.14,-o.size.d/2+.07],[0,1,0],'faucet')]},
 'shelf-unit':{category:'storage',mobility:'heavy',affordances:['store','place-on']},
 'tall-cabinet':{category:'storage',mobility:'fixed',affordances:['store','open'],parts:o=>fronts(o,[{kind:'doors'}],{y0:.08})},
 'shoe-cabinet':{category:'storage',mobility:'heavy',affordances:['store','open','place-on'],zone:'Arrival area',parts:o=>fronts(o,[{kind:'doors'}],{y0:.08})},
 'coat-rack':{category:'storage',mobility:'movable',affordances:['hang']},
 'umbrella-stand':{category:'storage',mobility:'movable',affordances:['store']},
 bed:{category:'bed',mobility:'heavy',affordances:['sleep','sit','lie'],zone:'Sleeping area'},
 nightstand:{category:'storage',mobility:'heavy',affordances:['place-on','store','open'],parts:o=>fronts(o,[{kind:'drawers',n:2}],{y0:.12})},
 wardrobe:{category:'storage',mobility:'fixed',affordances:['store','open','hang'],zone:'Storage area',parts:o=>fronts(o,[{kind:'doors',name:'Wardrobe door'}],{y0:.08})},
 dresser:{category:'storage',mobility:'heavy',affordances:['store','open','place-on'],parts:o=>fronts(o,[{kind:'drawers',n:3},{kind:'drawers',n:3}],{y0:.1})},
 'toy-chest':{category:'storage',mobility:'movable',affordances:['store','open'],parts:o=>[{id:`${o.id}:lid`,level:'object',kind:'lid',name:'Chest lid',joint:'revolute',hinge:'back',axis:[1,0,0],limit:[0,1.6],box:box(-o.size.w/2,o.size.w/2,o.size.h-.04,o.size.h,-o.size.d/2,o.size.d/2),children:[handlePart({id:`${o.id}:lid`},'Lid handle',[0,o.size.h-.05,o.size.d/2+.02])]}]},
 toilet:{category:'sanitary',mobility:'fixed',affordances:['use','flush'],zone:'Toilet area',parts:o=>[{id:`${o.id}:lid`,level:'object',kind:'lid',name:'Toilet lid',joint:'revolute',hinge:'back',axis:[1,0,0],limit:[0,1.7],box:box(-.18,.18,.4,.43,-.05,.33),children:[]},handlePart(o,'Flush button',[0,.79,-o.size.d/2+.1],[0,1,0],'button')]},
 vanity:{category:'sanitary',mobility:'fixed',affordances:['wash','store','open'],zone:'Grooming area',parts:o=>[...fronts(o,[{kind:'doors'},{kind:'drawers',n:2},{kind:'doors'}],{y0:.1,y1:o.size.h-.12}),handlePart({id:`${o.id}:basin-1`},'Faucet lever',[-o.size.w/4,o.size.h+.12,-o.size.d/2+.08],[0,1,0],'faucet'),handlePart({id:`${o.id}:basin-2`},'Faucet lever',[o.size.w/4,o.size.h+.12,-o.size.d/2+.08],[0,1,0],'faucet')]},
 bathtub:{category:'sanitary',mobility:'fixed',affordances:['bathe','fill-water'],zone:'Bathing area',parts:o=>[handlePart(o,'Tub faucet',[0,o.size.h+.12,-o.size.d/2+.06],[0,1,0],'faucet')]},
 shower:{category:'sanitary',mobility:'fixed',affordances:['shower','open'],zone:'Bathing area',parts:o=>[{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Glass shower door',joint:'revolute',hinge:'left',axis:[0,1,0],limit:[0,1.5],box:box(-o.size.w/2+.05,o.size.w/2-.4,.05,1.95,o.size.d/2-.02,o.size.d/2),children:[handlePart({id:`${o.id}:door-1`},'Shower door handle',[o.size.w/2-.48,1.05,o.size.d/2+.02])]}]},
 'towel-rack':{category:'fixture',mobility:'fixed',affordances:['hang']},
 mirror:{category:'decor',mobility:'fixed',affordances:['look-at']},
 hamper:{category:'storage',mobility:'movable',affordances:['store','carry']},
 treadmill:{category:'fitness',mobility:'heavy',affordances:['exercise','switch-on'],zone:'Cardio area'},
 'exercise-bike':{category:'fitness',mobility:'heavy',affordances:['exercise']},
 'weight-bench':{category:'fitness',mobility:'heavy',affordances:['exercise','sit'],zone:'Strength area'},
 'dumbbell-rack':{category:'fitness',mobility:'heavy',affordances:['store']},
 'pet-bed':{category:'pet',mobility:'movable',affordances:['rest'],zone:'Dog corner'},
 'cat-tree':{category:'pet',mobility:'heavy',affordances:['climb','rest']},
 'dog-crate':{category:'pet',mobility:'heavy',affordances:['rest','open']},
 'pet-bowls':{category:'pet',mobility:'movable',affordances:['fill-water','fill-food'],zone:'Feeding station'},
 'litter-box':{category:'pet',mobility:'movable',affordances:['clean']},
 'trash-bin':{category:'cleaning',mobility:'movable',affordances:['dispose','open'],zone:'Waste station'},
 'floor-lamp':{category:'lighting',mobility:'movable',affordances:['switch-on']},
 'table-lamp':{category:'lighting',mobility:'movable',affordances:['switch-on','grasp']},
 plant:{category:'plant',mobility:'movable',affordances:['water']},
 rug:{category:'textile',mobility:'movable',affordances:[]},
 vacuum:{category:'cleaning',mobility:'movable',affordances:['grasp','clean']},
 'mop-bucket':{category:'cleaning',mobility:'movable',affordances:['grasp','clean']},
 'laundry-basket':{category:'storage',mobility:'movable',affordances:['carry','store']},
 'ironing-board':{category:'cleaning',mobility:'movable',affordances:['unfold']},
 'luggage-rack':{category:'storage',mobility:'movable',affordances:['place-on']},
 // Workplace furniture and equipment.
 workstation:{category:'table',mobility:'heavy',affordances:['work-at','place-on'],zone:'Workstation cluster',colliders:tableColliders,parts:o=>fronts(o,[{w:o.size.w-.42,kind:'gap'},{w:.42,kind:'drawers',n:3}],{y0:.08,y1:o.size.h-.06})},
 'conference-table':{category:'table',mobility:'heavy',affordances:['meet-at','place-on'],zone:'Meeting table',colliders:tableColliders},
 'reception-desk':{category:'table',mobility:'fixed',affordances:['greet','place-on','work-at'],zone:'Reception desk',parts:o=>fronts(o,[{w:o.size.w-.45,kind:'gap'},{w:.45,kind:'drawers',n:3}],{y0:.1,y1:.72})},
 whiteboard:{category:'office-equipment',mobility:'fixed',affordances:['write-on','wipe']},
 printer:{category:'office-equipment',mobility:'heavy',affordances:['print','scan','load-paper','open'],zone:'Print station',parts:o=>{const {w,d,h}=o.size;return [{id:`${o.id}:drawer-1`,level:'object',kind:'drawer',name:'Paper tray',joint:'prismatic',axis:[0,0,1],travel:.35,box:box(-w/2+.05,w/2-.05,.12,.3,d/2,d/2+.02),children:[handlePart({id:`${o.id}:drawer-1`},'Tray handle',[0,.26,d/2+.04])]},{id:`${o.id}:drawer-2`,level:'object',kind:'drawer',name:'Paper tray',joint:'prismatic',axis:[0,0,1],travel:.35,box:box(-w/2+.05,w/2-.05,.32,.5,d/2,d/2+.02),children:[handlePart({id:`${o.id}:drawer-2`},'Tray handle',[0,.46,d/2+.04])]},{id:`${o.id}:lid`,level:'object',kind:'lid',name:'Scanner lid',joint:'revolute',hinge:'back',axis:[1,0,0],limit:[0,1.3],box:box(-w/2+.05,w/2-.05,h-.04,h,-d/2+.05,d/2-.05),children:[handlePart({id:`${o.id}:lid`},'Lid edge',[0,h-.02,d/2-.07])]},handlePart(o,'Control panel',[w/2-.15,h-.08,d/2-.05],[0,1,0],'button')];}},
 shredder:{category:'office-equipment',mobility:'movable',affordances:['shred','empty']},
 'server-rack':{category:'it-equipment',mobility:'fixed',affordances:['open','inspect'],zone:'Server rack row',parts:o=>fronts(o,[{kind:'door',name:'Perforated rack door'}],{y0:.08,y1:o.size.h-.06})},
 ups:{category:'it-equipment',mobility:'heavy',affordances:['inspect','switch-on']},
 'water-cooler':{category:'appliance',mobility:'movable',affordances:['fill-water'],parts:o=>[handlePart(o,'Water tap',[0,.95,o.size.d/2+.02],[0,0,1],'faucet')]},
 'vending-machine':{category:'appliance',mobility:'heavy',affordances:['buy','open'],parts:o=>[handlePart(o,'Product flap',[0,.25,o.size.d/2+.02],[0,0,1],'flap')]},
 'phone-booth':{category:'office-equipment',mobility:'heavy',affordances:['enter','call','open'],zone:'Focus booths',parts:o=>[{id:`${o.id}:door-1`,level:'object',kind:'door',name:'Glass booth door',joint:'revolute',hinge:'left',axis:[0,1,0],limit:[0,1.6],box:box(-o.size.w/2+.08,o.size.w/2-.08,.05,2.0,o.size.d/2-.03,o.size.d/2),children:[handlePart({id:`${o.id}:door-1`},'Booth door handle',[o.size.w/2-.16,1.05,o.size.d/2+.02])]}]},
 locker:{category:'storage',mobility:'fixed',affordances:['store','open'],zone:'Lockers',parts:o=>fronts(o,Array.from({length:Math.max(1,Math.round(o.size.w/.4))},()=>({kind:'door',name:'Locker door'})),{y0:.08,y1:o.size.h-.04})},
 'hand-dryer':{category:'fixture',mobility:'fixed',affordances:['dry-hands']},
 'paper-ream':{category:'office-supply',mobility:'movable',affordances:['grasp','load'],small:true},
 'conference-phone':{category:'electronics',mobility:'movable',affordances:['call','grasp'],small:true},
 // Small objects (manipulation targets, never navigation obstacles).
 cup:{category:'tableware',mobility:'movable',affordances:['grasp','fill-water','drink-from'],small:true},
 mug:{category:'tableware',mobility:'movable',affordances:['grasp','drink-from'],small:true},
 'plate-stack':{category:'tableware',mobility:'movable',affordances:['grasp','stack'],small:true},
 bowl:{category:'tableware',mobility:'movable',affordances:['grasp','fill'],small:true},
 'utensil-holder':{category:'tableware',mobility:'movable',affordances:['grasp'],small:true},
 'dish-rack':{category:'tableware',mobility:'movable',affordances:['place-in'],small:true},
 kettle:{category:'small-appliance',mobility:'movable',affordances:['grasp','heat','pour'],small:true},
 toaster:{category:'small-appliance',mobility:'movable',affordances:['heat','switch-on'],small:true},
 'coffee-maker':{category:'small-appliance',mobility:'movable',affordances:['switch-on','brew'],small:true},
 'cutting-board':{category:'tableware',mobility:'movable',affordances:['grasp','place-on'],small:true},
 'fruit-bowl':{category:'food',mobility:'movable',affordances:['grasp'],small:true},
 books:{category:'decor',mobility:'movable',affordances:['grasp','read'],small:true},
 vase:{category:'decor',mobility:'movable',affordances:['grasp','fill-water'],small:true},
 remote:{category:'electronics',mobility:'movable',affordances:['grasp'],small:true},
 monitor:{category:'electronics',mobility:'movable',affordances:['switch-on','look-at'],small:true},
 laptop:{category:'electronics',mobility:'movable',affordances:['grasp','open'],small:true},
 keyboard:{category:'electronics',mobility:'movable',affordances:['grasp'],small:true},
 'key-bowl':{category:'decor',mobility:'movable',affordances:['grasp','place-in'],small:true},
 toiletries:{category:'toiletry',mobility:'movable',affordances:['grasp'],small:true},
 towel:{category:'textile',mobility:'movable',affordances:['grasp','hang'],small:true},
 detergent:{category:'cleaning',mobility:'movable',affordances:['grasp','pour'],small:true},
 dumbbells:{category:'fitness',mobility:'movable',affordances:['grasp','lift'],small:true},
 // Household services already used by the simulation.
 hub:{category:'smart-home',mobility:'fixed',affordances:['read-temperature','switch-lights'],small:true},
 trash:{category:'litter',mobility:'movable',affordances:['pick-up','dispose'],small:true},
 surface:{category:'spill',mobility:'movable',affordances:['wipe'],small:true},
 dock:{category:'robot-infrastructure',mobility:'fixed',affordances:['charge','dock'],zone:'Charging zone'},
 bin:{category:'cleaning',mobility:'heavy',affordances:['dispose','empty-into'],zone:'Recycling station'},
 stairs:{category:'circulation',mobility:'fixed',affordances:['traverse']},
 elevator:{category:'circulation',mobility:'fixed',affordances:['call','ride']},
 outlet:{category:'electrical',mobility:'fixed',affordances:['plug-in','charge'],small:true},
 switch:{category:'electrical',mobility:'fixed',affordances:['switch-lights','press'],small:true},
 door:{category:'door',mobility:'fixed',affordances:['open','close','traverse']},
 window:{category:'window',mobility:'fixed',affordances:['open','look-through']},
};
for(const t of Object.values(TYPES)){t.colliders??=full;t.parts??=()=>[];}

// Base-cabinet run modules: [width, kind]. Embedded appliances become separate semantic objects.
function cabinetRunParts(o){
 const parts=[],cols=o.modules.map(([w,kind])=>kind==='drawers'?{w,kind:'drawers',n:3}:kind==='doors'?{w,kind:'doors'}:kind==='door'?{w,kind:'door'}:{w,kind:'gap'});
 for(const p of fronts(o,cols,{y0:.1,y1:o.size.h-.05}))parts.push(p);return parts;
}
TYPES['base-cabinets'].parts=cabinetRunParts;
// Colliders for the run follow the actual front-to-back depth of each module.
TYPES['base-cabinets'].colliders=full;

export function makeObject(spec,base){
 const [type,suffix,name,x,z,rot,w,d,h,extra={}]=spec,T=TYPES[type];
 if(!T)throw new Error(`Unknown object type ${type}`);
 const id=suffix.startsWith('furniture-')?suffix:`${base.room}:${suffix}`;
 const quarter=Math.round(rot/(Math.PI/2)),turned=Math.abs(quarter)%2===1;
 const o={id,type,name,category:T.category,f:base.f,room:base.room,x,z,y:extra.y??0,rot,size:{w,d,h},w:turned?d:w,d:turned?w:d,h,
  solid:extra.solid??!T.small,mobility:T.mobility,movable:T.mobility==='movable',static:T.mobility!=='movable',interactive:false,affordances:[...T.affordances],
  support:extra.support?(extra.support.startsWith('furniture-')?extra.support:`${base.room}:${extra.support}`):null,zone:extra.zone?`${base.room}:zone-${extra.zone}`:null,
  modules:extra.modules,embedded:!!extra.embedded,access:extra.access?{x:extra.access[0],z:extra.access[1]}:null};
 if(id.startsWith('furniture-')){o.baseline={x,z};o.moved=false;}
 o.parts=T.parts(o);o.interactive=o.parts.length>0||['tv','hub','switch','outlet','door','window','floor-lamp','table-lamp'].includes(type)||T.interactiveOnly===true;
 o.localColliders=o.solid?T.colliders(o):[];
 return o;
}

// Local -> world transform used everywhere (renderer, semantics and parts).
export function toWorld(o,lx,ly,lz){const c=Math.cos(o.rot),s=Math.sin(o.rot);return {x:o.x+lx*c+lz*s,y:(o.y??0)+ly,z:o.z-lx*s+lz*c};}
export function localBoxToWorld(o,b){const a=toWorld(o,b.x0,b.y0,b.z0),c=toWorld(o,b.x1,b.y1,b.z1);return {x0:Math.min(a.x,c.x),x1:Math.max(a.x,c.x),y0:Math.min(a.y,c.y),y1:Math.max(a.y,c.y),z0:Math.min(a.z,c.z),z1:Math.max(a.z,c.z)};}
export function worldDir(o,v){const c=Math.cos(o.rot),s=Math.sin(o.rot);return [v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];}
