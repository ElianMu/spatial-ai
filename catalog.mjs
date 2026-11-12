// Household object catalog: one source of truth for geometry, colliders, semantics and parts.
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

// ---------------------------------------------------------------- layout data ---
// Each entry: [type, id-suffix, name, x, z, rot, w, d, h, extra]. x/z are world centres.
// Anchor furniture keeps the historical ids furniture-<floor>-<room> used by tests and tasks.
export const LAYOUT={
 'room-0-0':[ // Open workspace A
  ['workstation','ws-1','Workstation A1',1.4,.65,ROT.S,1.4,.7,.74,{zone:'desks'}],
  ['workstation','ws-2','Workstation A2',2.85,.65,ROT.S,1.4,.7,.74,{zone:'desks'}],
  ['workstation','ws-3','Workstation A3',4.3,.65,ROT.S,1.4,.7,.74,{zone:'desks'}],
  ['office-chair','chair-1','Task chair A1',1.4,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['office-chair','chair-2','Task chair A2',2.85,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['office-chair','chair-3','Task chair A3',4.3,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['workstation','ws-4','Bench desk A4',1.5,4.0,ROT.N,1.4,.7,.74,{zone:'bench'}],
  ['workstation','furniture-0-0','Bench desk A5',2.9,4.0,ROT.N,1.4,.7,.74,{zone:'bench',access:[4,4]}],
  ['workstation','ws-6','Bench desk A6',1.5,4.7,ROT.S,1.4,.7,.74,{zone:'bench'}],
  ['workstation','ws-7','Bench desk A7',2.9,4.7,ROT.S,1.4,.7,.74,{zone:'bench'}],
  ['office-chair','chair-4','Task chair A4',1.5,3.15,ROT.S,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-5','Task chair A5',2.9,3.15,ROT.S,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-6','Task chair A6',1.5,5.55,ROT.N,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-7','Task chair A7',2.9,5.55,ROT.N,.6,.6,1.05,{zone:'bench'}],
  ['locker','lockers','Staff lockers',7.64,2.0,ROT.W,2.0,.6,1.9,{zone:'lockers'}],
  ['whiteboard','whiteboard','Project whiteboard',.15,2.6,ROT.E,1.6,.04,1.1,{y:.95,solid:false}],
  ['plant','plant','Office plant',7.4,6.35,ROT.S,.55,.55,1.5,{}],
  ['monitor','monitor-1','Monitor A1',1.4,.45,ROT.S,.6,.2,.45,{y:.74,support:'ws-1',solid:false,zone:'desks'}],
  ['monitor','monitor-2','Monitor A2',2.85,.45,ROT.S,.6,.2,.45,{y:.74,support:'ws-2',solid:false,zone:'desks'}],
  ['laptop','laptop-1','Laptop A3',4.3,.75,ROT.S,.32,.22,.02,{y:.74,support:'ws-3',solid:false,zone:'desks'}],
  ['keyboard','keyboard-1','Keyboard A1',1.4,.82,ROT.S,.44,.14,.03,{y:.74,support:'ws-1',solid:false,zone:'desks'}],
  ['mug','mug-1','Coffee mug A2',3.3,.8,ROT.S,.09,.09,.1,{y:.74,support:'ws-2',solid:false,zone:'desks'}],
  ['monitor','monitor-5','Monitor A5',2.9,3.85,ROT.N,.6,.2,.45,{y:.74,support:'furniture-0-0',solid:false,zone:'bench'}],
  ['monitor','monitor-6','Monitor A6',1.5,4.85,ROT.S,.6,.2,.45,{y:.74,support:'ws-6',solid:false,zone:'bench'}],
 ],
 'room-0-1':[ // Boardroom
  ['conference-table','furniture-0-1','Boardroom table',11.0,3.0,ROT.S,3.2,1.2,.75,{zone:'meeting',access:[11,5]}],
  ...[10,11,12].map((x,i)=>['chair',`chair-n${i+1}`,`Meeting chair N${i+1}`,x,1.95,ROT.S,.5,.55,.9,{zone:'meeting'}]),
  ...[10,11,12].map((x,i)=>['chair',`chair-s${i+1}`,`Meeting chair S${i+1}`,x,4.05,ROT.N,.5,.55,.9,{zone:'meeting'}]),
  ['chair','chair-w','Meeting chair (west end)',9.0,3.0,ROT.E,.5,.55,.9,{zone:'meeting'}],
  ['chair','chair-e','Meeting chair (east end)',13.0,3.0,ROT.W,.5,.55,.9,{zone:'meeting'}],
  ['sideboard','credenza','Credenza',12.0,.35,ROT.S,1.8,.45,.85,{zone:'meeting'}],
  ['tv','display','Wall display',8.1,3.0,ROT.E,1.65,.06,.95,{y:1.0,solid:false,zone:'meeting'}],
  ['whiteboard','whiteboard','Boardroom whiteboard',15.9,3.0,ROT.W,1.8,.04,1.1,{y:.95,solid:false}],
  ['plant','plant','Olive tree',15.4,.65,ROT.S,.5,.5,1.3,{}],
  ['conference-phone','phone','Conference speakerphone',11.0,3.0,ROT.S,.28,.28,.05,{y:.75,support:'furniture-0-1',solid:false,zone:'meeting'}],
  ['cup','cup-1','Water glass',10.4,2.7,ROT.S,.08,.08,.12,{y:.75,support:'furniture-0-1',solid:false,zone:'meeting'}],
  ['laptop','laptop','Presenter laptop',12.1,3.15,ROT.S,.32,.22,.02,{y:.75,support:'furniture-0-1',solid:false,zone:'meeting'}],
  ['vase','carafe','Water carafe',12.4,.33,ROT.S,.13,.13,.28,{y:.85,support:'credenza',solid:false}],
 ],
 'room-0-2':[ // Pantry
  ['base-cabinets','base-cabinets','Pantry base cabinets',19.36,.425,ROT.S,6.6,.6,.92,{zone:'counter',modules:[[.6,'drawers'],[.6,'doors'],[.6,'dishwasher'],[1,'doors'],[.6,'drawers'],[.76,'doors'],[.6,'drawers'],[.8,'doors'],[.6,'drawers'],[.44,'door']],access:[19,2]}],
  ['dishwasher','dishwasher','Dishwasher',17.56,.43,ROT.S,.6,.58,.86,{zone:'counter',solid:false,support:'base-cabinets',embedded:true}],
  ['sink','sink','Pantry sink',18.36,.43,ROT.S,.8,.5,.2,{zone:'counter',y:.72,solid:false,support:'base-cabinets',embedded:true}],
  ['refrigerator','refrigerator','Refrigerator',23.35,.53,ROT.S,.9,.75,1.85,{zone:'cold'}],
  ['upper-cabinets','upper-cabinets-1','Upper cabinets (west)',17.03,.3,ROT.S,1.94,.35,.75,{zone:'counter',y:1.45,solid:false}],
  ['upper-cabinets','upper-cabinets-2','Upper cabinets (east)',21.0,.3,ROT.S,3.3,.35,.75,{zone:'counter',y:1.45,solid:false}],
  ['island','furniture-0-2','Pantry high table',19.0,3.4,ROT.N,2.0,.9,1.0,{zone:'island',access:[19,5]}],
  ['stool','stool-1','Bar stool W',18.5,4.2,ROT.N,.4,.4,.75,{zone:'island'}],
  ['stool','stool-2','Bar stool E',19.5,4.2,ROT.N,.4,.4,.75,{zone:'island'}],
  ['pantry-cabinet','pantry','Snack cabinet',23.575,2.6,ROT.W,1.2,.6,2.2,{}],
  ['water-cooler','water-cooler','Water cooler',16.3,3.0,ROT.E,.35,.35,1.1,{}],
  ['vending-machine','vending','Vending machine',23.475,6.1,ROT.W,.9,.8,1.85,{}],
  ['trash-bin','trash-bin','Pantry trash bin',16.35,6.6,ROT.E,.4,.35,.65,{zone:'waste'}],
  ['trash-bin','recycling-bin','Pantry recycling bin',16.8,6.6,ROT.N,.4,.35,.65,{zone:'waste'}],
  ['microwave','microwave','Microwave',20.3,.36,ROT.S,.5,.38,.3,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['microwave','microwave-2','Microwave (second)',20.85,.36,ROT.S,.5,.38,.3,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['coffee-maker','coffee-maker','Espresso machine',21.9,.3,ROT.S,.32,.38,.42,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['kettle','kettle','Electric kettle',16.5,.38,ROT.S,.2,.17,.24,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['dish-rack','dish-rack','Dish drying rack',19.15,.42,ROT.S,.45,.32,.14,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['cup','cup-1','Glass cup',19.32,.36,ROT.S,.08,.08,.12,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['mug','mug-1','Coffee mug',21.5,.45,ROT.S,.09,.09,.1,{zone:'counter',y:.92,support:'base-cabinets',solid:false}],
  ['fruit-bowl','fruit-bowl','Fruit bowl',19.4,3.35,ROT.S,.3,.3,.14,{zone:'island',y:1.0,support:'furniture-0-2',solid:false}],
  ['cup','cup-2','Water glass',18.7,3.6,ROT.S,.08,.08,.12,{zone:'island',y:1.0,support:'furniture-0-2',solid:false}],
 ],
 'room-0-3':[ // Print & supply room
  ['printer','furniture-0-3','Multifunction printer',1.2,17.5,ROT.N,1.0,.75,1.2,{zone:'print',access:[1,16]}],
  ['printer','printer-2','Plotter printer',2.5,17.55,ROT.N,.7,.6,.95,{zone:'print'}],
  ['shredder','shredder','Paper shredder',3.6,17.65,ROT.N,.5,.4,.7,{zone:'print'}],
  ['shelf-unit','shelf-unit','Supply shelving',.325,14.5,ROT.E,1.2,.4,1.8,{zone:'supplies'}],
  ['tall-cabinet','storage-cabinet','Stationery cabinet',7.64,16.4,ROT.W,1.2,.6,2.1,{zone:'supplies'}],
  ['conference-table','sorting-table','Mail sorting table',3.2,15.2,ROT.S,1.6,.8,.9,{zone:'print'}],
  ['trash-bin','paper-bin','Paper recycling bin',6.6,17.6,ROT.N,.45,.4,.7,{}],
  ['vacuum','vacuum','Upright vacuum',.4,12.5,ROT.E,.3,.3,1.1,{zone:'cleaning'}],
  ['mop-bucket','mop-bucket','Mop and bucket',.45,13.15,ROT.E,.36,.36,1.2,{zone:'cleaning'}],
  ['paper-ream','paper-1','Paper reams',.3,14.2,ROT.E,.3,.22,.12,{y:1.0,support:'shelf-unit',solid:false,zone:'supplies'}],
  ['paper-ream','paper-2','Paper ream',3.4,15.2,ROT.S,.3,.22,.06,{y:.9,support:'sorting-table',solid:false,zone:'print'}],
 ],
 'room-0-4':[ // Reception
  ['reception-desk','furniture-0-4','Reception desk',10.2,13.8,ROT.S,2.4,.8,1.05,{zone:'reception',access:[12,14]}],
  ['office-chair','reception-chair','Receptionist chair',10.2,12.95,ROT.S,.6,.6,1.05,{zone:'reception'}],
  ['monitor','reception-monitor','Reception monitor',10.0,13.65,ROT.S,.55,.18,.42,{y:1.05,support:'furniture-0-4',solid:false,zone:'reception'}],
  ['sofa','waiting-sofa','Waiting sofa',14.6,17.425,ROT.N,2.0,.9,.82,{zone:'waiting'}],
  ['coffee-table','waiting-table','Waiting area table',14.6,16.1,ROT.S,.9,.5,.4,{zone:'waiting'}],
  ['coat-rack','coat-rack','Coat rack',8.45,12.9,ROT.E,.45,.45,1.8,{zone:'reception'}],
  ['umbrella-stand','umbrella-stand','Umbrella stand',10.8,17.6,ROT.N,.25,.25,.5,{}],
  ['plant','plant-1','Lobby plant',8.55,17.35,ROT.S,.6,.6,1.6,{}],
  ['plant','plant-2','Lobby plant',15.45,11.6,ROT.S,.5,.5,1.3,{}],
  ['rug','doormat','Entrance mat',12.0,17.45,ROT.S,1.2,.7,.012,{solid:false}],
  ['books','magazines','Magazines',14.4,16.1,ROT.S,.3,.22,.04,{y:.4,support:'waiting-table',solid:false,zone:'waiting'}],
 ],
 'room-0-5':[ // Lounge
  ['sofa','furniture-0-5','Lounge sofa',18.6,17.4,ROT.N,2.2,.95,.85,{zone:'lounge',access:[20,17]}],
  ['armchair','armchair-1','Lounge armchair',16.7,15.4,ROT.E,.85,.85,.9,{zone:'lounge'}],
  ['armchair','armchair-2','Lounge armchair',20.7,16.0,ROT.W,.85,.85,.9,{zone:'lounge'}],
  ['coffee-table','coffee-table','Lounge coffee table',18.6,16.0,ROT.S,1.1,.6,.42,{zone:'lounge'}],
  ['phone-booth','booth-1','Phone booth 1',23.375,12.55,ROT.W,1.0,1.0,2.2,{zone:'booths'}],
  ['phone-booth','booth-2','Phone booth 2',23.375,13.75,ROT.W,1.0,1.0,2.2,{zone:'booths'}],
  ['rug','rug','Lounge rug',18.6,16.2,ROT.S,2.8,1.8,.012,{solid:false,zone:'lounge'}],
  ['plant','plant','Monstera',23.45,17.45,ROT.S,.6,.6,1.4,{}],
  ['mug','mug','Coffee mug',18.4,16.0,ROT.S,.09,.09,.1,{y:.42,support:'coffee-table',solid:false,zone:'lounge'}],
 ],
 'room-1-0':[ // Open workspace B
  ['workstation','furniture-1-0','Workstation B1',1.4,.65,ROT.S,1.4,.7,.74,{zone:'desks',access:[1,2]}],
  ['workstation','ws-2','Workstation B2',2.85,.65,ROT.S,1.4,.7,.74,{zone:'desks'}],
  ['workstation','ws-3','Workstation B3',4.3,.65,ROT.S,1.4,.7,.74,{zone:'desks'}],
  ['office-chair','chair-1','Task chair B1',1.4,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['office-chair','chair-2','Task chair B2',2.85,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['office-chair','chair-3','Task chair B3',4.3,1.4,ROT.N,.6,.6,1.05,{zone:'desks'}],
  ['workstation','ws-4','Bench desk B4',1.5,4.0,ROT.N,1.4,.7,.74,{zone:'bench'}],
  ['workstation','ws-5','Bench desk B5',2.9,4.0,ROT.N,1.4,.7,.74,{zone:'bench'}],
  ['workstation','ws-6','Bench desk B6',1.5,4.7,ROT.S,1.4,.7,.74,{zone:'bench'}],
  ['workstation','ws-7','Bench desk B7',2.9,4.7,ROT.S,1.4,.7,.74,{zone:'bench'}],
  ['office-chair','chair-4','Task chair B4',1.5,3.15,ROT.S,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-5','Task chair B5',2.9,3.15,ROT.S,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-6','Task chair B6',1.5,5.55,ROT.N,.6,.6,1.05,{zone:'bench'}],
  ['office-chair','chair-7','Task chair B7',2.9,5.55,ROT.N,.6,.6,1.05,{zone:'bench'}],
  ['locker','lockers','Staff lockers',7.64,2.0,ROT.W,2.0,.6,1.9,{zone:'lockers'}],
  ['plant','plant','Office plant',7.4,6.35,ROT.S,.55,.55,1.5,{}],
  ['monitor','monitor-1','Monitor B1',1.4,.45,ROT.S,.6,.2,.45,{y:.74,support:'furniture-1-0',solid:false,zone:'desks'}],
  ['monitor','monitor-3','Monitor B3',4.3,.45,ROT.S,.6,.2,.45,{y:.74,support:'ws-3',solid:false,zone:'desks'}],
  ['laptop','laptop-5','Laptop B5',2.9,4.05,ROT.N,.32,.22,.02,{y:.74,support:'ws-5',solid:false,zone:'bench'}],
  ['mug','mug-7','Mug B7',3.2,4.8,ROT.S,.09,.09,.1,{y:.74,support:'ws-7',solid:false,zone:'bench'}],
 ],
 'room-1-1':[ // Huddle room
  ['conference-table','furniture-1-1','Huddle table',11.4,2.8,ROT.S,1.8,1.0,.75,{zone:'meeting',access:[13,3]}],
  ['chair','chair-1','Huddle chair 1',10.95,1.95,ROT.S,.5,.55,.9,{zone:'meeting'}],
  ['chair','chair-2','Huddle chair 2',11.85,1.95,ROT.S,.5,.55,.9,{zone:'meeting'}],
  ['chair','chair-3','Huddle chair 3',10.95,3.65,ROT.N,.5,.55,.9,{zone:'meeting'}],
  ['chair','chair-4','Huddle chair 4',11.85,3.65,ROT.N,.5,.55,.9,{zone:'meeting'}],
  ['tv','display','Huddle display',8.1,2.8,ROT.E,1.4,.06,.8,{y:1.05,solid:false,zone:'meeting'}],
  ['whiteboard','whiteboard','Huddle whiteboard',15.9,2.6,ROT.W,1.6,.04,1.1,{y:.95,solid:false}],
  ['armchair','armchair','Lounge chair',15.4,5.4,ROT.W,.85,.85,.9,{}],
  ['plant','plant','Office plant',8.5,6.4,ROT.S,.5,.5,1.2,{}],
  ['conference-phone','phone','Speakerphone',11.4,2.8,ROT.S,.26,.26,.05,{y:.75,support:'furniture-1-1',solid:false,zone:'meeting'}],
 ],
 'room-1-2':[ // Manager's office
  ['desk','furniture-1-2','Executive desk',18.4,.9,ROT.S,1.8,.8,.75,{zone:'exec',access:[18,3]}],
  ['office-chair','office-chair','Executive chair',18.4,1.75,ROT.N,.65,.65,1.15,{zone:'exec'}],
  ['monitor','monitor','Monitor',18.4,.7,ROT.S,.6,.2,.45,{y:.75,support:'furniture-1-2',solid:false,zone:'exec'}],
  ['keyboard','keyboard','Keyboard',18.4,1.05,ROT.S,.44,.14,.03,{y:.75,support:'furniture-1-2',solid:false,zone:'exec'}],
  ['mug','mug','Tea mug',19.0,1.0,ROT.S,.09,.09,.1,{y:.75,support:'furniture-1-2',solid:false,zone:'exec'}],
  ['bookshelf','bookshelf-1','Office bookshelf',23.7,1.5,ROT.W,1.8,.35,2.0,{zone:'library'}],
  ['bookshelf','bookshelf-2','Office bookshelf (short)',23.7,3.4,ROT.W,.9,.35,2.0,{zone:'library'}],
  ['tall-cabinet','file-cabinet','File cabinet',16.4,.425,ROT.S,.45,.6,.7,{zone:'exec'}],
  ['conference-table','meeting-table','Small meeting table',17.6,4.4,ROT.S,.9,.9,.74,{zone:'meet'}],
  ['chair','chair-1','Guest chair',17.6,3.6,ROT.S,.5,.55,.9,{zone:'meet'}],
  ['chair','chair-2','Guest chair',17.6,5.2,ROT.N,.5,.55,.9,{zone:'meet'}],
  ['plant','plant','Office plant',16.5,6.45,ROT.S,.5,.5,1.3,{}],
  ['rug','rug','Office rug',19.6,3.2,ROT.S,2.4,1.7,.012,{solid:false}],
 ],
 'room-1-3':[ // Server & IT room
  ['server-rack','furniture-1-3','Server rack 1',1.0,17.34,ROT.N,.6,1.07,2.0,{zone:'racks',access:[1,15]}],
  ['server-rack','rack-2','Server rack 2',1.7,17.34,ROT.N,.6,1.07,2.0,{zone:'racks'}],
  ['server-rack','rack-3','Network rack',2.4,17.34,ROT.N,.6,1.07,2.0,{zone:'racks'}],
  ['ups','ups','UPS battery cabinet',3.3,17.5,ROT.N,.5,.7,1.0,{zone:'racks'}],
  ['workstation','it-bench','IT workbench',7.565,14.2,ROT.W,1.6,.75,.9,{zone:'it'}],
  ['office-chair','it-chair','IT stool',6.9,14.2,ROT.E,.55,.55,.95,{zone:'it'}],
  ['shelf-unit','spares','Spare parts shelving',.325,13.2,ROT.E,1.6,.4,1.8,{}],
  ['laptop','laptop','Service laptop',7.6,14.0,ROT.W,.32,.22,.02,{y:.9,support:'it-bench',solid:false,zone:'it'}],
 ],
 'room-1-4':[ // Restrooms
  ['vanity','furniture-1-4','Washbasin counter',8.335,13.8,ROT.E,1.6,.55,.85,{zone:'grooming',access:[9,14]}],
  ['mirror','mirror','Restroom mirror',8.08,13.8,ROT.E,1.4,.03,.9,{y:1.1,solid:false,zone:'grooming'}],
  ['toiletries','soap','Soap dispenser',8.3,13.4,ROT.E,.12,.12,.18,{y:.85,support:'furniture-1-4',solid:false,zone:'grooming'}],
  ['hand-dryer','hand-dryer','Hand dryer',8.08,15.0,ROT.E,.3,.2,.4,{y:1.0,solid:false,zone:'grooming'}],
  ['toilet','toilet-1','Toilet (stall 1)',10.0,17.5,ROT.N,.4,.7,.78,{zone:'toilet'}],
  ['toilet','toilet-2','Toilet (stall 2)',11.4,17.5,ROT.N,.4,.7,.78,{zone:'toilet'}],
  ['tall-cabinet','storage-cabinet','Janitor cabinet',15.74,12.4,ROT.W,.6,.4,1.8,{}],
  ['trash-bin','sanitary-bin','Paper towel bin',8.35,15.6,ROT.E,.35,.3,.6,{zone:'grooming'}],
 ],
 'room-1-5':[ // Wellness room
  ['treadmill','furniture-1-5','Treadmill',17.0,16.6,ROT.N,.85,1.95,1.4,{zone:'cardio',access:[18,15]}],
  ['exercise-bike','exercise-bike','Exercise bike',18.6,16.9,ROT.N,.55,1.1,1.2,{zone:'cardio'}],
  ['weight-bench','weight-bench','Weight bench',20.6,16.7,ROT.N,1.2,.45,.45,{zone:'strength'}],
  ['dumbbell-rack','dumbbell-rack','Dumbbell rack',23.675,15.0,ROT.W,1.0,.4,.8,{zone:'strength'}],
  ['dumbbells','dumbbells','Dumbbell set',23.68,15.0,ROT.W,.9,.3,.15,{y:.8,support:'dumbbell-rack',solid:false,zone:'strength'}],
  ['rug','yoga-mat','Yoga mat',20.8,14.0,ROT.E,1.8,.6,.008,{solid:false}],
  ['tall-cabinet','storage-cabinet','Towel cabinet',23.7,12.3,ROT.W,1.0,.35,1.2,{}],
  ['mirror','mirror','Wellness mirror',23.86,13.6,ROT.W,1.6,.03,1.6,{y:.5,solid:false}],
 ],
 'corridor-0':[
  ['rug','runner','Corridor runner',12.0,9.0,ROT.S,8.0,1.0,.01,{solid:false}],
  ['whiteboard','notice-board','Notice board',6.0,7.08,ROT.S,1.2,.03,.8,{y:1.1,solid:false}],
 ],
 'corridor-1':[
  ['wardrobe','supply-closet','Supply closet',.3625,9.0,ROT.E,1.4,.475,2.2,{}],
  ['rug','runner','Upper corridor runner',12.0,9.0,ROT.S,8.0,1.0,.01,{solid:false}],
 ],
};

// Exterior windows: [floor, wall side, centre along wall, width, sill, head, room].
export const WINDOWS=[
 [0,'N',2.5,2.4,.9,2.2,'room-0-0'],[0,'W',4.9,1.4,.9,2.2,'room-0-0'],[0,'N',12,2.0,.95,2.2,'room-0-1'],[0,'N',18.36,1.2,1.1,2.1,'room-0-2'],[0,'E',4.6,1.4,.95,2.1,'room-0-2'],
 [0,'S',4.8,1.2,1.0,2.1,'room-0-3'],[0,'S',13.1,.4,.25,2.1,'room-0-4'],[0,'S',14.6,1.2,.9,2.1,'room-0-4'],[0,'S',20,1.8,.9,2.2,'room-0-5'],[0,'E',15.8,1.4,.9,2.1,'room-0-5'],[0,'W',9.0,1.0,.95,2.1,'corridor-0'],
 [1,'N',6.0,1.4,.95,2.2,'room-1-0'],[1,'N',14.0,1.6,.9,2.2,'room-1-1'],[1,'N',21.6,1.6,.9,2.2,'room-1-2'],[1,'E',5.4,1.2,.9,2.1,'room-1-2'],
 [1,'S',6.0,1.2,.9,2.1,'room-1-3'],[1,'W',16.0,1.2,.9,2.1,'room-1-3'],[1,'S',13.4,1.0,1.4,2.1,'room-1-4'],[1,'S',21.0,2.0,.9,2.2,'room-1-5'],
];

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
