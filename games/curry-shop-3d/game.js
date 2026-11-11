import * as THREE from './vendor/three.module.js';
const lowPower=new URLSearchParams(location.search).get('lite')==='1';
if(lowPower)document.documentElement?.classList?.add('lite');
const $=id=>document.getElementById(id);
// MENU CATALOG START
const dishes=[
 {name:'ไข่พะโล้',detail:'ไข่ต้มผ่าครึ่ง หมูสามชั้น และน้ำพะโล้เข้มข้น'},
 {name:'แกงเขียวหวาน',detail:'แกงกะทิสีเขียว ไก่ มะเขือ โหระพา และพริกแดง'},
 {name:'ผัดกะเพรา',detail:'หมูสับผัดซอส ใบกะเพรา และพริกสด'},
 {name:'ผัดพริกแกง',detail:'หมูสามชั้นผัดพริกแกง ถั่วฝักยาว และใบผัก'},
 {name:'หมูทอดกระเทียม',detail:'หมูทอดเป็นชั้น หนังกรอบ กระเทียม และงาขาว'},
 {name:'ผัดผักรวม',detail:'แครอต ผักเขียว และเนื้อไก่'}
];
const menus=[...dishes.slice(0,5).map((dish,i)=>({name:dish.name,dishes:[i],detail:dish.detail})),
 {name:'ข้าวสองอย่าง',dishes:[1,2]},
 {name:'ชุดอิ่มอร่อย',dishes:[0,4,5]},
 {name:'เหมายกร้าน',dishes:[0,1,2,3,4,5]}
];
for(const menu of menus)menu.detail??=menu.dishes.map(i=>dishes[i].name).join(' + ');
const giftBindings=[['incense','🌹','Rose'],['temple','🫰','Finger Heart'],['tree','🌷','Rosa'],['fruit','🌶️','Perfume'],['lamp','🍩','Doughnut'],['lantern','🕊️','Paper Crane'],['bell','🫶','Hand Heart'],['grand','🌌','Galaxy']];
const giftArtIds=["5655", "5487", "8913", "5658", "5879", "5659", "6968", "11046"];
const gifts=giftBindings.map(([action,icon,gift],i)=>[action,icon,menus[i].name,gift]);
function giftImage(index,gift){return `<span class="tiktok-gift gift-${giftArtIds[index]}" role="img" aria-label="${gift}"></span>`;}
// MENU CATALOG END
// ORDER QUEUE START
export class OrderQueue{
 constructor(){this.pending=[];this.active=null;this.nextId=0;this.served=0;}
 enqueue(e,preview=false){const index=['incense','temple','tree','fruit','lamp','lantern','bell','grand'].indexOf(e.action),count=Number(e.count??1);if(index<0||!Number.isInteger(count)||count<1||count>100)return null;const name=String(e.name||'ลูกค้า').slice(0,40),same=this.pending.find(o=>o.name===name&&o.index===index&&o.preview===preview);if(same){same.count+=count;return same;}const o={id:++this.nextId,index,name,count,preview};if(preview)this.pending.push(o);else{const firstDemo=this.pending.findIndex(p=>p.preview);if(firstDemo<0)this.pending.push(o);else this.pending.splice(firstDemo,0,o);}return o;}
 next(){if(!this.active)this.active=this.pending.shift()||null;return this.active;}
 finish(){if(!this.active)return null;const o=this.active;this.served+=o.count;this.active=null;return o;}
 get waiting(){return this.pending.length+(this.active?1:0);}
}
// ORDER QUEUE END
const queue=new OrderQueue(),supporters=new Map(),points=[1,5,10,20,30,99,100,1000];let demoTimer=null,serviceAge=0,now=0,last=0,celebrationTimer;
let lastRealNotice=-Infinity;
function notice(t,preview=false){if(preview&&Date.now()-lastRealNotice<6000)return;$('notice').textContent=t;}
for(const [index,[action,icon,label,gift]] of gifts.entries()){const tile=document.createElement('div');tile.innerHTML=`${giftImage(index,gift)}<b>${label}</b><small>${gift}</small>`;$('gift-strip').append(tile);const b=document.createElement('button');b.innerHTML=`<strong>${giftImage(index,gift)}<span>${label}</span></strong><small>${gift} · ทดลองสั่ง</small>`;b.title=menus[index].detail;tile.title=menus[index].detail;if(index>=5){const detail=document.createElement('small');detail.className='menu-combo-detail';detail.textContent=menus[index].detail;b.append(detail);}b.onclick=()=>receive({action,name:$('viewer').value,count:1},true);$('actions').append(b);}
let renderer;try{renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:!lowPower});}catch(e){$('render-error').hidden=false;throw e;}
renderer.setSize(450,800,false);renderer.setPixelRatio(lowPower?1:Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=!lowPower;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor('#a6bba4');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();scene.fog=new THREE.Fog('#a6bba4',27,48);
// Vendor in the upper half, customers approach from the foreground below.
const camera=new THREE.PerspectiveCamera(39,450/800,.1,60);camera.position.set(0,13.8,18.8);camera.lookAt(0,.6,1.6);
scene.add(new THREE.HemisphereLight('#fff6da','#526c53',3));const sun=new THREE.DirectionalLight('#ffe2ad',3.5);sun.position.set(-6,12,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-10,right:10,top:12,bottom:-10});scene.add(sun);
const mat=(color,metalness=0,roughness=.7)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const cream=mat('#f6e7be'),teal=mat('#437d68'),wood=mat('#ad7042'),steel=mat('#c1c9c2',.75,.28),riceMat=mat('#fff3d3'),skin=mat('#e3ad82'),hair=mat('#342920');const shared=new Set([cream,teal,wood,steel,riceMat,skin,hair]);
function mesh(geo,m,x=0,y=0,z=0,parent=scene){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(w,h,d,m,x,y,z,p){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p);}
function sphere(r,m,x,y,z,p){return mesh(new THREE.SphereGeometry(r,12,8),m,x,y,z,p);}
function cylinder(r,h,m,x,y,z,p){return mesh(new THREE.CylinderGeometry(r,r,h,24),m,x,y,z,p);}
box(25,.25,27,mat('#d6c5a5'),0,-.2,2);box(12,6,.3,teal,0,2.8,-5);box(.25,5.5,7,cream,-6,2.5,-1.7);box(.25,5.5,7,cream,6,2.5,-1.7);
const grout=mat('#baae92');for(let x=-6;x<=6;x++)box(.025,.025,20,grout,x,-.06,3);for(let z=-5;z<=15;z++)box(12,.025,.025,grout,0,-.06,z);
const awning=mat('#c95f42');for(let i=0;i<12;i++){box(1,.16,2.2,i%2?cream:awning,-5.5+i,5.4,-3.8);box(1,.45,.1,i%2?cream:awning,-5.5+i,5.13,-2.73);}
function sign(text,w=1024,h=160,bg='#fff0c6',fg='#315c47'){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.font=`bold ${Math.floor(h*.48)}px Tahoma`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2,w-30);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:texture});}
mesh(new THREE.PlaneGeometry(6.8,1.05),sign('หมูเฮง • ข้าวราดแกง'),0,4.1,-4.8);mesh(new THREE.PlaneGeometry(2.4,1.2),sign('อร่อยทุกจาน',512,240,'#284e40','#ffe1a0'),-4,2.8,-4.75);
box(11,.2,1.8,wood,0,1.15,-3.7);for(let i=0;i<5;i++)cylinder(.48,.25,steel,-4.6+i*.75,1.4,-3.7);
box(10.4,1.45,2.6,teal,0,.67,-.7);box(10.4,.13,.1,wood,0,.6,.65);
// Rounded stainless food wells are recessed into real openings in the counter.
function roundedRectangle(x,y,w,h,r){const shape=new THREE.Shape();shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);return shape;}
const trayCenters=Array.from({length:6},(_,i)=>({x:-3.65+i%3*2.05,z:-1.35+Math.floor(i/3)*1.2}));
const counterShape=roundedRectangle(-5.35,-.75,10.7,2.9,.08);
for(const {x,z} of trayCenters)counterShape.holes.push(roundedRectangle(x-.84,-z-.44,1.68,.88,.1));
const counterSurface=mesh(new THREE.ExtrudeGeometry(counterShape,{depth:.16,bevelEnabled:false,curveSegments:6}),cream,0,1.38,0);counterSurface.rotation.x=-Math.PI/2;
function recessedTray(x,z,index){const group=new THREE.Group();group.name='recessed-food-tray-'+index;scene.add(group);group.position.set(x,0,z);
 const rimShape=roundedRectangle(-.94,-.54,1.88,1.08,.13);rimShape.holes.push(roundedRectangle(-.80,-.40,1.6,.8,.10));
 const lip=mesh(new THREE.ExtrudeGeometry(rimShape,{depth:.035,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,curveSegments:6}),steel,0,1.60,0,group);lip.rotation.x=-Math.PI/2;
 const top=roundedRectangle(-.8,-.4,1.6,.8,.1).getSpacedPoints(48),bottom=roundedRectangle(-.69,-.29,1.38,.58,.10).getSpacedPoints(48),positions=[];
 for(let i=0;i<48;i++){const a=top[i],b=top[i+1],c=bottom[i],d=bottom[i+1];positions.push(a.x,1.61,-a.y,b.x,1.61,-b.y,c.x,1.42,-c.y,b.x,1.61,-b.y,d.x,1.42,-d.y,c.x,1.42,-c.y);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();const innerSteel=steel.clone();innerSteel.side=THREE.DoubleSide;innerSteel.roughness=.32;mesh(geometry,innerSteel,0,0,0,group);
 const base=mesh(new THREE.ShapeGeometry(roundedRectangle(-.69,-.29,1.38,.58,.10),6),innerSteel,0,1.421,0,group);base.rotation.x=-Math.PI/2;
 return group;
}
// FOOD MODELS START — shared geometry and instancing keep detailed trays light.
const foodGeometries={round:new THREE.SphereGeometry(1,12,8),block:new THREE.BoxGeometry(1,1,1),grain:new THREE.SphereGeometry(1,6,4),leaf:new THREE.SphereGeometry(1,8,5)};
const sharedGeometries=new Set(Object.values(foodGeometries));
const foodMaterials={};
for(const [name,color] of Object.entries({broth:'#693b20',coconut:'#a4bb64',redSauce:'#b94720',egg:'#fff0c9',yolk:'#eead28',pork:'#a46436',fat:'#e6c392',skin:'#804323',chicken:'#e5bf84',basil:'#276639',vein:'#6ca14b',chilli:'#d93723',greenChilli:'#71933b',eggplant:'#789545',eggplantInside:'#e6d8aa',bean:'#417f3a',carrot:'#ed8b2b',rice:'#fff2d6',garlic:'#e0ba70',crust:'#c18a39',star:'#46291b',sesame:'#f2d798'})){foodMaterials[name]=mat(color,0,['broth','coconut','redSauce'].includes(name)?.35:.72);shared.add(foodMaterials[name]);}
function foodModel(kind,parent,seed=1){
 const group=new THREE.Group();group.name='food-'+kind;parent.add(group);const batches=new Map();let state=seed+kind*391;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 function part(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const key=shape+':'+color;if(!batches.has(key))batches.set(key,[]);batches.get(key).push({x,y,z,sx,sy,sz,rx,ry,rz});}
 function leaf(x,z,size=.19,y=.16){const a=rand()*6.28;part('leaf','basil',x,y,z,size*.5,.018,size,0,a,.1);part('block','vein',x,y+.018,z,.012,.007,size*1.45,0,a,0);}
 function chilli(x,z,y=.2){const a=rand()*6.28;part('round','chilli',x,y,z,.035,.025,.16,0,a,.15);part('block','greenChilli',x+Math.sin(a)*.13,y+.005,z+Math.cos(a)*.13,.018,.023,.07,0,a,.25);}
 function pork(x,z,crispy=false,y=.11){const a=rand()*2;part('block',crispy?'crust':'pork',x,y,z,.27,.12,.18,0,a,.09);part('block','fat',x,y+.057,z,.24,.025,.155,0,a,.09);part('block',crispy?'crust':'skin',x,y+.079,z,.26,.025,.17,0,a,.09);}
 if(kind===0){part('round','broth',0,.025,0,.91,.055,.49);for(let i=0;i<5;i++){const x=-.62+i*.3,z=(i%2?1:-1)*.18;pork(x,z,false,.095);}for(const [x,z] of [[-.43,-.1],[.25,.13],[.56,-.16]]){part('round','egg',x,.16,z,.18,.14,.23,0,.3,.15);part('round','yolk',x,.268,z,.105,.035,.13);}for(let i=0;i<6;i++){const a=i*Math.PI/3;part('block','star',-.08+Math.sin(a)*.055,.12,-.3+Math.cos(a)*.055,.025,.025,.13,0,a,0);}}
 if(kind===1){part('round','coconut',0,.025,0,.91,.06,.49);for(let i=0;i<7;i++){const x=(rand()-.5)*1.4,z=(rand()-.5)*.65;part('block','chicken',x,.11,z,.23,.1,.13,0,rand()*3,.12);}for(const [x,z] of [[-.5,.2],[.1,-.2],[.5,.1]]){part('round','eggplant',x,.14,z,.17,.1,.17);part('round','eggplantInside',x,.205,z,.13,.018,.13);for(let j=0;j<5;j++)part('grain','garlic',x+(rand()-.5)*.14,.229,z+(rand()-.5)*.14,.013,.008,.02);}for(let i=0;i<5;i++)leaf((rand()-.5)*1.4,(rand()-.5)*.65);chilli(.12,.24);for(let i=0;i<8;i++)part('grain','egg',-.6+i*.16,.095,Math.sin(i)*.1,.1,.007,.025,0,.3,0);}
 if(kind===2){part('round','broth',0,.025,0,.86,.03,.44);for(let i=0;i<28;i++)part('block','pork',(rand()-.5)*1.5,.08+rand()*.07,(rand()-.5)*.65,.08+rand()*.07,.07,.07,rand(),rand()*5,rand());for(let i=0;i<10;i++)leaf((rand()-.5)*1.4,(rand()-.5)*.7,.14);for(let i=0;i<4;i++)chilli((rand()-.5)*1.2,(rand()-.5)*.6);}
 if(kind===3){part('round','redSauce',0,.025,0,.9,.05,.47);for(let i=0;i<9;i++)pork((rand()-.5)*1.4,(rand()-.5)*.6,false);for(let i=0;i<14;i++)part('block','bean',(rand()-.5)*1.4,.19,(rand()-.5)*.6,.075,.055,.26,0,rand()*6,.1);for(let i=0;i<4;i++){leaf((rand()-.5)*1.2,(rand()-.5)*.6,.12,.24);chilli((rand()-.5)*1.2,(rand()-.5)*.6,.25);}}
 if(kind===4){for(let i=0;i<10;i++){const x=-.64+(i%5)*.32,z=-.21+Math.floor(i/5)*.4;pork(x,z,true,.13);for(let j=0;j<5;j++)part('grain','garlic',x+(rand()-.5)*.2,.255,z+(rand()-.5)*.1,.025,.018,.022);}for(let i=0;i<20;i++)part('grain','sesame',(rand()-.5)*1.5,.27,(rand()-.5)*.6,.011,.006,.022);}
 if(kind===5){for(let i=0;i<14;i++){const x=(rand()-.5)*1.5,z=(rand()-.5)*.6;part('block',i%2?'bean':'carrot',x,.12+rand()*.05,z,.12,.07,.21,0,rand()*4,.1);if(i%3===0)leaf(x,z,.13,.22);}for(let i=0;i<6;i++)part('block','chicken',(rand()-.5)*1.3,.15,(rand()-.5)*.6,.18,.07,.13,0,rand()*3,0);}
 const dummy=new THREE.Object3D();for(const [key,list] of batches){const [shape,color]=key.split(':');const inst=new THREE.InstancedMesh(foodGeometries[shape],foodMaterials[color],list.length);inst.name=kind+':'+color;for(const [i,p] of list.entries()){dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx,p.ry,p.rz);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}inst.castShadow=true;inst.receiveShadow=true;group.add(inst);}return group;
}
const menuDescriptions=menus.map(menu=>menu.detail);
const trayNames=dishes.map(dish=>dish.name);
for(let i=0;i<6;i++){const {x,z}=trayCenters[i];const tray=recessedTray(x,z,i);const food=foodModel(i,tray,10+i);food.position.set(0,1.455,0);food.scale.set(.74,.8,.60);const card=mesh(new THREE.PlaneGeometry(1.58,.20),sign(trayNames[i],512,96),x,1.51,z+.57);card.rotation.x=-.5;}
// FOOD MODELS END
const glass=new THREE.MeshPhysicalMaterial({color:'#d6f0e6',transparent:true,opacity:.12,roughness:.1,depthWrite:false});box(.045,1.2,2.5,glass,-5.1,2.17,-.7);box(.045,1.2,2.5,glass,5.1,2.17,-.7);for(let i=0;i<6;i++)cylinder(.48,.06,cream,4.25,1.6+i*.06,-.8);
const shirtColors=['#e09a49','#638fb8','#bd6b85','#7a9e67','#976bc0','#d97e5e'];
function person(color,vendor=false){const root=new THREE.Group(),body=new THREE.Group();scene.add(root);root.add(body);const shirt=mat(color);box(.69,.83,.4,shirt,0,1.18,0,body);const head=sphere(.29,skin,0,1.96,0,body);head.scale.y=1.12;const cap=sphere(.3,hair,0,2.1,-.045,body);cap.scale.set(1,.75,.9);sphere(.04,hair,-.1,1.98,.266,body);sphere(.04,hair,.1,1.98,.266,body);const arms=[],legs=[],knees=[];
 for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.46,1.5,0);body.add(arm);box(.21,.53,.23,shirt,0,-.22,0,arm);sphere(.12,skin,0,-.53,0,arm);arms.push(arm);const leg=new THREE.Group();leg.position.set(side*.19,.79,0);body.add(leg);box(.25,.32,.28,teal,0,-.16,0,leg);const knee=new THREE.Group();knee.position.y=-.32;leg.add(knee);box(.25,.33,.28,teal,0,-.16,0,knee);box(.28,.15,.43,hair,0,-.36,.06,knee);legs.push(leg);knees.push(knee);}
 if(vendor){box(.56,.9,.06,mat('#f5c86c'),0,1.04,.24,body);box(.3,.2,.065,teal,0,1.13,.28,body);sphere(.2,hair,0,2.21,-.22,body);}return {root,body,arms,legs,knees};}
const vendor=person('#df7755',true);vendor.root.position.set(.9,0,-2.6);vendor.root.scale.setScalar(1.18);
const ladle=new THREE.Group();vendor.arms[1].add(ladle);cylinder(.025,.9,steel,0,-.8,.15,ladle);const spoon=sphere(.18,steel,0,-1.25,.15,ladle);spoon.scale.y=.3;
function clearFood(group){group.traverse(n=>{if(n.isInstancedMesh)n.dispose();else if(n.geometry&&!sharedGeometries.has(n.geometry))n.geometry.dispose();});group.removeFromParent();}
function plate(parent,menu=0){const group=new THREE.Group();group.name='meal-plate';parent.add(group);cylinder(.55,.055,cream,0,0,0,group);const rim=mesh(new THREE.TorusGeometry(.51,.022,6,28),cream,0,.035,0,group);rim.rotation.x=Math.PI/2;group.userData.food=new THREE.Group();group.add(group.userData.food);setPlateMenu(group,menu);return group;}
function setPlateMenu(group,menu){if(group.userData.menuIndex===menu)return;const content=group.userData.food;while(content.children.length)clearFood(content.children[0]);group.userData.menuIndex=menu;
 const rice=sphere(.27,riceMat,-.19,.11,0,content);rice.scale.set(1,.65,1.25);const grains=new THREE.InstancedMesh(foodGeometries.grain,foodMaterials.rice,26);const d=new THREE.Object3D();for(let i=0;i<26;i++){const a=i*2.399,r=Math.sqrt(i/26)*.24;d.position.set(-.19+Math.cos(a)*r,.17+Math.sqrt(Math.max(0,1-r*r/.065))*.1,Math.sin(a)*r*1.2);d.scale.set(.028,.012,.013);d.rotation.y=a;d.updateMatrix();grains.setMatrixAt(i,d.matrix);}content.add(grains);
 const kinds=menus[menu].dishes;for(const [i,kind] of kinds.entries()){const food=foodModel(kind,content,menu*19+i);const columns=kinds.length>2?2:1;food.position.set(.15+(i%columns)*.16,.06,-.24+Math.floor(i/columns)*(kinds.length>4?.2:.25)+(kinds.length===1?.23:0));food.scale.set(kinds.length>2?.14:.27,.45,kinds.length===1?.53:kinds.length>4?.18:.25);}
 const cucumber=sphere(.10,foodMaterials.eggplant,.05,.075,.38,content);cucumber.scale.set(1,.12,1);const cucumberInside=sphere(.076,foodMaterials.eggplantInside,.05,.09,.38,content);cucumberInside.scale.y=.1;
}
const servingPlate=plate(scene);servingPlate.position.set(2.7,1.59,.35);servingPlate.scale.setScalar(1.3);servingPlate.visible=false;
// Dining area: keep the central queue aisle open.
const diningSeats=[];
for(const side of [-1,1])for(const z of [3.6,6.1]){
 const x=side*3.2;const table=new THREE.Group();table.name='dining-table';scene.add(table);cylinder(.76,.12,wood,x,1.05,z,table);cylinder(.09,.95,steel,x,.5,z,table);cylinder(.37,.07,steel,x,.02,z,table);
 const chairX=side*2.1;box(.6,.11,.63,teal,chairX,.61,z);for(const dx of [-.23,.23])for(const dz of [-.23,.23])box(.055,.56,.055,wood,chairX+dx,.28,z+dz);box(.09,.65,.65,teal,chairX-side*.29,.94,z);
 cylinder(.075,.2,cream,x+side*.22,1.2,z+.18,table);box(.17,.17,.17,cream,x,1.18,z-.2,table);
 diningSeats.push({position:new THREE.Vector3(chairX,0,z),rotation:side*Math.PI/2,occupant:null});
}
const actors=new Map();
function customer(order,index){const a=person(shirtColors[index%6]);a.root.rotation.y=Math.PI;a.root.position.set((index%2?1:-1)*(1.1+Math.floor(index/2)*.9),0,5+Math.floor(index/2)*1.5);const label=document.createElement('div');label.className='customer-name';label.textContent=(order.preview?'ทดลอง · ':'')+order.name;$('customer-labels').append(label);a.label=label;a.order=order;a.plate=plate(a.root,order.index);a.plate.position.set(0,1.02,.52);a.plate.visible=false;actors.set(order.id,a);return a;}
const ambient=[];for(let i=0;i<4;i++){const a=person(shirtColors[i]);a.root.position.set(i%2?1.25:-1.25,0,5.6+Math.floor(i/2)*1.4);a.root.rotation.y=Math.PI;a.root.scale.setScalar(.92);ambient.push(a);}
function receive(e,preview=false){preview=preview||e.preview===true;const order=queue.enqueue(e,preview);if(!order)return;if(!preview)lastRealNotice=Date.now();restaurantAudio.play('order');notice(`${preview?'ทดลอง · ':''}${order.name} มาสั่ง${gifts[order.index][2]} ×${Number(e.count)||1}`,preview);if(!preview){supporters.set(order.name,(supporters.get(order.name)||0)+points[order.index]*Number(e.count));$('leaders').replaceChildren(...[...supporters].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,score],i)=>{const span=document.createElement('span');span.textContent=`${i+1}. ${name} ${score.toLocaleString()}`;return span;}));}stats();}
function stats(){$('cooked').firstChild.textContent=queue.waiting+' ';$('bags').firstChild.textContent=queue.served.toLocaleString()+' ';}
function walk(a,target,dt,speed=2.5){a.root.position.y=0;a.knees.forEach(k=>k.rotation.x=0);const p=a.root.position,dx=target.x-p.x,dz=target.z-p.z,dist=Math.hypot(dx,dz);if(dist<.04){a.legs.forEach(l=>l.rotation.x=0);a.body.position.y=0;return true;}if(now-(a.lastStep??-10)>.38){restaurantAudio.play('step');a.lastStep=now;}const step=Math.min(dist,dt*speed);p.x+=dx/dist*step;p.z+=dz/dist*step;a.root.rotation.y=Math.atan2(dx,dz);a.legs[0].rotation.x=Math.sin(now*9)*.4;a.legs[1].rotation.x=-Math.sin(now*9)*.4;a.body.position.y=Math.abs(Math.sin(now*9))*.035;return false;}
function disposeActor(a){scene.remove(a.root);a.label.remove();const geos=new Set(),mats=new Set();a.root.traverse(n=>{if(n.isInstancedMesh)n.dispose();if(n.geometry&&!sharedGeometries.has(n.geometry))geos.add(n.geometry);if(n.material&&!shared.has(n.material))mats.add(n.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
const orderPosition=new THREE.Vector3(1.65,0,1.7),exitPosition=new THREE.Vector3(7.5,0,7);
let lastRenderTime=-Infinity;
function frame(time){requestAnimationFrame(frame);if(lowPower&&time-lastRenderTime<1000/30)return;lastRenderTime=time;now=time/1000;const dt=Math.min(.05,last?now-last:.016);last=now;const current=queue.next(),visible=[...(current?[current]:[]),...queue.pending.slice(0,6)];for(const [i,o] of visible.entries())if(!actors.has(o.id))customer(o,i);ambient.forEach(a=>a.root.visible=queue.waiting===0);
 for(const [i,o] of queue.pending.slice(0,6).entries()){const a=actors.get(o.id);if(a)walk(a,new THREE.Vector3((i%2?1:-1)*1.25,0,4.4+Math.floor(i/2)*1.45),dt,2);}
 if(current){const a=actors.get(current.id);if(walk(a,orderPosition,dt)){const previousAge=serviceAge;serviceAge+=dt;if(previousAge<.8&&serviceAge>=.8)restaurantAudio.play('scoop');if(previousAge<1.7&&serviceAge>=1.7)restaurantAudio.play('scoop');if(previousAge<2.6&&serviceAge>=2.6)restaurantAudio.play('plate');a.root.rotation.y=Math.PI;a.arms[0].rotation.x=serviceAge<.9?-.6:0;const menu=gifts[current.index][2];setPlateMenu(servingPlate,current.index);$('dish-detail').textContent=menuDescriptions[current.index];$('order').textContent=`${current.name} · ${menu} ×${current.count}`;$('progress').style.width=Math.min(100,serviceAge/4*100)+'%';vendor.arms[1].rotation.x=-.8-Math.sin(serviceAge*5)*.45;vendor.arms[1].rotation.z=Math.sin(serviceAge*2)*.4;vendor.body.rotation.y=Math.sin(serviceAge*2)*.17;servingPlate.visible=serviceAge>2;
 if(serviceAge>4){const done=queue.finish();a.plate.visible=true;if(menus[done.index].dishes.length>=2){a.dining='waiting';a.seat=null;}else a.exiting=true;servingPlate.visible=false;serviceAge=0;notice(`${done.preview?'ทดลอง · ':''}คุณ${done.name} รับ${menu}แล้ว อร่อยให้อิ่มนะคะ 🍛`,done.preview);restaurantAudio.play('serve');sellerVoice.thank(done);if(done.index===7){restaurantAudio.play('celebrate');$('celebration').hidden=false;clearTimeout(celebrationTimer);celebrationTimer=setTimeout(()=>$('celebration').hidden=true,3000);}stats();}}
 }else{$('order').textContent='ส่งของขวัญเพื่อเข้าคิวสั่งอาหาร';$('dish-detail').textContent='แกง 6 ถาด · ข้าวสวยร้อน ๆ · ตักสดทุกจาน';$('progress').style.width='0%';vendor.arms[1].rotation.x=Math.sin(now*1.2)*.08;vendor.body.rotation.y=0;}
 for(const [id,a] of actors){
 if(a.dining==='waiting'){const seat=diningSeats.find(s=>s.occupant===null);if(seat){seat.occupant=id;a.seat=seat;a.dining='walking';}else{walk(a,new THREE.Vector3(id%2?2:-2,0,2.6),dt);a.label.textContent=(a.order.preview?'ทดลอง · ':'')+a.order.name+' · รอโต๊ะ';}}
 if(a.dining==='walking'&&walk(a,a.seat.position,dt,2.3)){a.dining='eating';restaurantAudio.play('seat');restaurantAudio.play('plate');a.eatAge=0;a.root.rotation.y=a.seat.rotation;a.label.textContent=(a.order.preview?'ทดลอง · ':'')+a.order.name+' · ทานข้าว';}
 if(a.dining==='eating'){a.eatAge+=dt;a.root.position.y=-.1;a.body.position.y=0;a.legs.forEach(l=>l.rotation.x=-Math.PI/2);a.knees.forEach(k=>k.rotation.x=Math.PI/2);a.arms[0].rotation.x=-.75+Math.sin(a.eatAge*3)*.25;a.arms[1].rotation.x=-.55;a.plate.position.set(0,1.19,.77);if(a.eatAge>=9){restaurantAudio.play('seat');a.seat.occupant=null;a.dining=null;a.exiting=true;a.plate.visible=false;a.arms.forEach(arm=>arm.rotation.x=0);a.legs.forEach(l=>l.rotation.x=0);a.knees.forEach(k=>k.rotation.x=0);a.root.position.y=0;a.label.textContent=(a.order.preview?'ทดลอง · ':'')+a.order.name+' · อิ่มแล้ว';}}
 if(a.exiting&&walk(a,exitPosition,dt,3)){disposeActor(a);actors.delete(id);continue;}a.root.updateMatrixWorld(true);const p=new THREE.Vector3(0,2.65,0).applyMatrix4(a.root.matrixWorld).project(camera);a.label.style.left=`${(p.x+1)*225}px`;a.label.style.top=`${(1-p.y)*400}px`;a.label.classList.toggle('is-ordering',queue.active?.id===id);a.label.hidden=p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
 renderer.render(scene,camera);
}requestAnimationFrame(frame);
// ORIGINAL RESTAURANT AUDIO START
export function createRestaurantAudio(createContext=()=>new AudioContext()){
 let ctx=null,master=null,compressor=null,musicGain=null,musicSource=null,musicBuffer=null,enabled=false,volume=.55,musicEnabled=true,musicVolume=.32,ducking=false;const sources=new Set(),lastPlayed=new Map();
 function startMusic(){if(!ctx||!musicEnabled||musicSource)return;if(!musicBuffer)musicBuffer=composeIdleMusic(ctx);musicSource=ctx.createBufferSource();musicSource.buffer=musicBuffer;musicSource.loop=true;musicSource.connect(musicGain);musicSource.start();}
 function stopMusic(){if(musicSource){const src=musicSource;musicSource=null;src.stop();src.disconnect();}}
 function tone(frequency,at,duration=.16,level=.1,type='sine',end=frequency){if(!ctx||sources.size>=14)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(level,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain).connect(master);sources.add(osc);osc.onended=()=>{sources.delete(osc);osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.02);}
 function noise(at,duration,level,frequency,type='lowpass'){if(!ctx||sources.size>=14)return;const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);const data=src.buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;filter.type=type;filter.frequency.value=frequency;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(level,at+.009);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);src.connect(filter).connect(gain).connect(master);sources.add(src);src.onended=()=>{sources.delete(src);src.disconnect();filter.disconnect();gain.disconnect();};src.start(at);src.stop(at+duration+.02);}
 function play(kind){if(!enabled||!ctx||ctx.state==='suspended')return false;const t=ctx.currentTime,gaps={step:.16,scoop:.25,plate:.35,order:.2,serve:.25,seat:.3,celebrate:1};if(t-(lastPlayed.get(kind)??-100)<(gaps[kind]??.15))return false;lastPlayed.set(kind,t);
 switch(kind){case'step':noise(t,.07,.07,550);tone(115,t,.06,.025,'sine',75);break;
 case'order':tone(1046,t,.24,.10);tone(1568,t+.075,.25,.055);break;
 case'scoop':noise(t,.23,.055,1900,'bandpass');tone(710,t,.10,.025,'triangle',440);break;
 case'plate':tone(1320,t,.22,.06);tone(1920,t+.025,.16,.027);noise(t,.045,.025,2600);break;
 case'seat':noise(t,.18,.065,680,'bandpass');tone(165,t,.11,.028,'triangle',110);break;
 case'serve':[659,880,1046].forEach((f,i)=>tone(f,t+i*.075,.25,.065));break;
 case'celebrate':[523,659,784,1046,1318].forEach((f,i)=>tone(f,t+i*.09,.32,.065));break;
 default:return false;}return true;}
 return {async start(){if(enabled)return;ctx=createContext();try{await ctx.resume();master=ctx.createGain();master.gain.value=volume;compressor=ctx.createDynamicsCompressor();master.connect(compressor).connect(ctx.destination);musicGain=ctx.createGain();musicGain.gain.value=musicVolume*(ducking?.23:1);musicGain.connect(compressor);enabled=true;lastPlayed.clear();
 startMusic();play('order');
 }catch(e){enabled=false;if(ctx)await ctx.close();ctx=null;throw e;}},async stop(){enabled=false;lastPlayed.clear();stopMusic();musicBuffer=null;for(const src of sources){try{src.stop();}catch{}}sources.clear();if(ctx)await ctx.close();ctx=null;master=null;musicGain=null;compressor=null;},play,setMusicEnabled(value){musicEnabled=Boolean(value);if(enabled){if(musicEnabled)startMusic();else stopMusic();}},setDucking(value){ducking=Boolean(value);if(musicGain&&ctx)musicGain.gain.setTargetAtTime(musicVolume*(ducking?.23:1),ctx.currentTime,.12);},setMusicVolume(value){musicVolume=Math.min(1,Math.max(0,Number(value)||0));if(musicGain&&ctx)musicGain.gain.setTargetAtTime(musicVolume*(ducking?.23:1),ctx.currentTime,.05);},setVolume(value){volume=Math.min(1,Math.max(0,Number(value)||0));if(master&&ctx)master.gain.setTargetAtTime(volume,ctx.currentTime,.05);},getState(){return {enabled,volume,active:sources.size,musicEnabled,musicVolume,musicPlaying:musicSource!==null};}};
}
// Original 16-bar idle-game cue. All instruments are calculated waveforms, not recordings.
export function composeIdleMusic(ctx){
 const rate=22050,beat=60/90,bars=16,length=Math.round(bars*4*beat*rate),buffer=ctx.createBuffer(2,length,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
 const freq=m=>440*2**((m-69)/12);let randomState=73971;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296*2-1;};
 function note(midi,start,duration,level,voice='pluck',pan=0){const f=freq(midi),offset=Math.round(start*rate),samples=Math.round(duration*rate);for(let i=0;i<samples;i++){const t=i/rate,phase=t*f*Math.PI*2,attack=Math.min(1,t/.008),tail=Math.min(1,(duration-t)/.08);let wave,envelope;if(voice==='bass'){wave=Math.sin(phase)+.12*Math.sin(phase*2);envelope=attack*Math.exp(-t*5)*tail;}else if(voice==='pad'){wave=Math.sin(phase)+.15*Math.sin(phase*2+.3);envelope=Math.min(1,t/.15)*Math.min(1,(duration-t)/.3)*.5;}else{wave=Math.sin(phase)*.75+Math.sin(phase*2)*Math.exp(-t*10)*.22+Math.sin(phase*3)*Math.exp(-t*18)*.08;envelope=attack*Math.exp(-t*4.5)*tail;}const value=wave*envelope*level,index=(offset+i)%length;left[index]+=value*(1-pan*.5);right[index]+=value*(1+pan*.5);}}
 function percussion(start,kind){const offset=Math.round(start*rate),duration=kind==='kick'?.16:.07;for(let i=0;i<duration*rate;i++){const t=i/rate;const v=kind==='kick'?Math.sin(2*Math.PI*(70*t-65*t*t))*Math.exp(-t*28)*.065:random()*Math.exp(-t*65)*(kind==='brush'?.018:.01);const index=(offset+i)%length;left[index]+=v;right[index]+=v;}}
 const chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59]];
 const melody=[[76,79,0,74,72,0,76,74],[72,0,76,79,81,79,0,76],[77,76,72,0,69,72,76,0],[74,0,79,76,74,71,0,72],[79,76,0,72,74,76,79,0],[81,0,79,76,72,0,69,72],[77,79,76,0,72,69,0,72],[74,76,79,0,74,71,72,0]];
 for(let bar=0;bar<bars;bar++){const start=bar*4*beat,chord=chords[bar%4];for(let k=0;k<4;k++){note(chord[k]+12,start+k*.035,beat*3.6,.024,'pad',(k-1.5)*.3);note(chord[k]+24,start+(k+.5)*beat,beat*.65,.025,'pluck',(k%2?.45:-.45));}note(chord[0],start,beat*.85,.09,'bass',-.1);note(chord[0]+7,start+2*beat,beat*.75,.07,'bass',.1);
 for(let step=0;step<8;step++){const midi=melody[bar%8][step],swing=step%2?.055:0;if(midi)note(midi+(bar>=8&&step===6?12:0),start+(step*.5+swing)*beat,beat*.95,.095,'pluck',Math.sin(step)*.3);percussion(start+(step*.5+swing)*beat,step%2?'hat':'brush');}percussion(start,'kick');percussion(start+2*beat,'kick');}
 return buffer;
}
// ORIGINAL RESTAURANT AUDIO END
// SELLER VOICE START
export function createSellerVoice({synth,Utterance,onSpeaking=()=>{},onStatus=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let enabled=false,current=null,pending=[],overflow=0,token=0,timer=null,voiceURI='',volume=.9,line=0;
 const phrases=[name=>`ขอบคุณ${name}ที่อุดหนุนนะคะ ทานให้อร่อยค่ะ`,name=>`ได้แล้วค่ะ ขอบคุณ${name}นะคะ ขอให้ทานข้าวให้อร่อย อิ่มท้องอิ่มใจค่ะ`,name=>`ขอบคุณ${name}ที่แวะมาร้านหมูเฮงนะคะ ทานให้อร่อย แล้วมาอุดหนุนกันอีกนะคะ`];
 const voices=()=>synth?.getVoices().filter(v=>/^th(?:-|_)/i.test(v.lang))||[];
 function pump(){if(!enabled||current)return;if(!pending.length&&overflow){pending.push({text:'ขอบคุณลูกค้าทุกท่านที่อุดหนุนร้านหมูเฮงนะคะ ทานให้อร่อยทุกท่านค่ะ'});overflow=0;}if(!pending.length)return;const item=pending.shift(),id=++token;current=item;const u=new Utterance(item.text),list=voices();u.lang='th-TH';u.voice=list.find(v=>v.voiceURI===voiceURI)||list.find(v=>/kanya|premwadee|achara|female|หญิง/i.test(v.name))||list[0];u.rate=.95;u.pitch=1.06;u.volume=volume;
 const finish=()=>{if(id!==token)return;clearTimer(timer);timer=null;current=null;onSpeaking(false);pump();};u.onstart=()=>{if(id===token){onSpeaking(true);onStatus(item.text);}};u.onend=finish;u.onerror=finish;timer=setTimer(()=>{if(id!==token)return;++token;synth.cancel();current=null;onSpeaking(false);pump();},25000);try{synth.speak(u);}catch{finish();}}
 return {voices,enable(){if(!synth||!Utterance){onStatus('เบราว์เซอร์นี้ไม่รองรับเสียงพูด');return false;}if(!voices().length){onStatus('ยังไม่พบเสียงภาษาไทยในเบราว์เซอร์ ลองเปิดใน Chrome แล้วเลือกเสียงอีกครั้ง');return false;}enabled=true;onStatus('เปิดเสียงแม่ค้าแล้ว · จะขอบคุณตอนส่งอาหาร');return true;},disable(){enabled=false;++token;clearTimer(timer);timer=null;pending=[];overflow=0;current=null;synth?.cancel();onSpeaking(false);onStatus('ปิดเสียงแม่ค้าอยู่');},thank(order){if(!enabled)return;const name=String(order.name||'ลูกค้า').replace(/[<>\[\]{}]/g,'').trim().slice(0,40);const text=phrases[line++%phrases.length](name?'คุณ'+name:'ลูกค้า');if(pending.length<5)pending.push({text});else overflow++;pump();},preview(){if(!enabled)return;pending.unshift({text:'ขอบคุณที่อุดหนุนร้านหมูเฮงนะคะ ทานให้อร่อยค่ะ แล้วแวะมาอีกนะคะ'});pump();},configure(options){if(options.voiceURI!==undefined)voiceURI=options.voiceURI;if(options.volume!==undefined)volume=Math.max(0,Math.min(1,Number(options.volume)||0));},getState(){return {enabled,queued:pending.length,speaking:current!==null};}};
}
// SELLER VOICE END
const restaurantAudio=createRestaurantAudio();let changingSound=false;
const sellerVoice=createSellerVoice({synth:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,onSpeaking:value=>restaurantAudio.setDucking(value),onStatus:text=>$('seller-status').textContent=text});
function sellerUi(){$('seller-toggle').textContent=sellerVoice.getState().enabled?'🔊 ปิดเสียงแม่ค้า':'🗣 เปิดเสียงแม่ค้า';}
function loadSellerVoices(){const select=$('seller-voice'),selected=select.value,list=sellerVoice.voices();select.replaceChildren(...list.map(v=>{const option=document.createElement('option');option.value=v.voiceURI;option.textContent=v.name;return option;}));if(list.length){select.value=list.some(v=>v.voiceURI===selected)?selected:(list.find(v=>/kanya|premwadee|achara|female|หญิง/i.test(v.name))||list[0]).voiceURI;sellerVoice.configure({voiceURI:select.value});}else{const option=document.createElement('option');option.textContent='ยังไม่พบเสียงภาษาไทย';select.append(option);}}
$('seller-toggle').onclick=()=>{if(sellerVoice.getState().enabled)sellerVoice.disable();else sellerVoice.enable();sellerUi();};$('seller-preview').onclick=()=>{if(!sellerVoice.getState().enabled)sellerVoice.enable();sellerVoice.preview();sellerUi();};$('seller-volume').oninput=e=>sellerVoice.configure({volume:e.target.value});$('seller-voice').onchange=e=>sellerVoice.configure({voiceURI:e.target.value});window.speechSynthesis?.addEventListener('voiceschanged',loadSellerVoices);loadSellerVoices();

function soundUi(){const on=restaurantAudio.getState().enabled;$('sound').textContent=on?'🔊 ปิดเสียงร้าน':'🔇 เปิดเสียงร้าน';$('sound-overlay').textContent=on?'🔊 เสียงเปิด':'🔇 เปิดเสียง';$('sound-status').textContent=on?(restaurantAudio.getState().musicEnabled?'เปิดเสียงประกอบและเพลง idle · เช้าวันสบาย ร้านหมูเฮง':'เปิดเฉพาะเสียงประกอบ · เพลงปิดอยู่'):'ปิดเสียงอยู่ · กดเปิดเสียงจากหน้านี้ก่อน';}
async function toggleSound(){if(changingSound)return;changingSound=true;try{if(restaurantAudio.getState().enabled){await restaurantAudio.stop();sellerVoice.disable();}else{await restaurantAudio.start();sellerVoice.enable();}sellerUi();soundUi();}catch{$('sound-status').textContent='เปิดเสียงไม่สำเร็จ ลองกดอีกครั้งใน Chrome';}finally{changingSound=false;}}
$('music-toggle').onclick=()=>{const state=restaurantAudio.getState();restaurantAudio.setMusicEnabled(!state.musicEnabled);$('music-toggle').textContent=state.musicEnabled?'♫ เปิดเพลง idle':'♫ ปิดเพลง idle';soundUi();};$('music-volume').oninput=e=>restaurantAudio.setMusicVolume(e.target.value);
$('sound').onclick=toggleSound;$('sound-overlay').onclick=toggleSound;$('sound-volume').oninput=e=>restaurantAudio.setVolume(e.target.value);$('sound-test').onclick=async()=>{if(!restaurantAudio.getState().enabled)await toggleSound();restaurantAudio.play('celebrate');};
$('demo').onclick=()=>{if(demoTimer){clearInterval(demoTimer);demoTimer=null;$('demo').textContent='▶ ทดลองเล่นอัตโนมัติ';return;}const names=['น้องมะลิ','พี่สมชาย','คุณสายรุ้ง','น้องต้นข้าว','คุณอ้อม'];let n=0;const add=()=>{receive({action:gifts[n%8][0],name:names[n%names.length],count:1},true);n++;};add();demoTimer=setInterval(add,5000);$('demo').textContent='■ หยุดทดลองอัตโนมัติ';};
$('full').onclick=()=>$('game').requestFullscreen();function resize(){const full=(new URLSearchParams(location.search).has('overlay')||/\.trycloudflare\.com$/i.test(location.hostname||''))||document.fullscreenElement;$('game').style.transform=full?`scale(${Math.min(innerWidth/450,innerHeight/800)})`:'';$('game').style.transformOrigin='top left';}if((new URLSearchParams(location.search).has('overlay')||/\.trycloudflare\.com$/i.test(location.hostname||'')))document.body.classList.add('overlay');addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);resize();
/* CURRY POLL TRANSPORT START */
function createCurryPoll({fetchFn,onEvent,onError=()=>{},timer=setTimeout}){
 let cursor=null,epoch=null,stopped=false;
 async function poll(){if(stopped)return;try{
  const query=cursor===null?'':`?after=${cursor}&epoch=${encodeURIComponent(epoch)}`;
  const response=await fetchFn('/api/poll'+query,{cache:'no-store'});if(!response.ok)throw Error('poll unavailable');
  const data=await response.json();if(!data.ready)throw Error('not ready');
  if(!data.reset)for(const event of data.events||[])onEvent(event);
  cursor=data.cursor;epoch=data.epoch;
 }catch(error){onError(error);}if(!stopped)timer(poll,650);}
 return {start:poll,stop(){stopped=true;}};
}
/* CURRY POLL TRANSPORT END */
if(new URLSearchParams(location.search).get('transport')==='poll'||/\.trycloudflare\.com$/i.test(location.hostname||'')){
 createCurryPoll({fetchFn:fetch,onEvent:receive,onError:()=>$('connection').textContent='○ กำลังเชื่อมต่อร้านใหม่'}).start();
}else{
const events=new EventSource('/api/events');events.onmessage=e=>{try{receive(JSON.parse(e.data));}catch(err){console.error(err);}};events.onerror=()=>$('connection').textContent='○ กำลังเชื่อมต่อร้านใหม่';}
async function bridgeStatus(){try{const s=await(await fetch('/api/bridge')).json(),connected=s.connection==='connected';$('bridge').textContent=connected?`● TikFinity เชื่อมแล้ว · รับ ${s.forwardedEvents} กิจกรรม`:'○ เปิด TikFinity Desktop แล้วเชื่อม LIVE';$('connection').textContent=connected?'● TikFinity พร้อม · ส่งของขวัญเพื่อเดินมาสั่งอาหาร':'○ โหมดทดลอง · รอเชื่อม TikFinity';}catch{$('bridge').textContent='เชื่อมตัวรับของขวัญไม่ได้';}}bridgeStatus();setInterval(bridgeStatus,5000);notice('แม่ค้าพร้อมแล้วค่ะ ส่งของขวัญแล้วมารับข้าวราดแกง 🍛');window.kitchenState=()=>({seated:[...actors.values()].filter(a=>a.dining==='eating').length,dining:[...actors.values()].filter(a=>a.dining).map(a=>({menu:a.order.index,state:a.dining})),tables:diningSeats.length,menu:servingPlate.userData.menuIndex,waiting:queue.waiting,served:queue.served,visibleCustomers:actors.size,webgl:renderer.info.render.calls>0});
