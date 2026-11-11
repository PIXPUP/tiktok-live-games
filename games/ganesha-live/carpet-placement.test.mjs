import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* CARPET PLACEMENT START */')[1].split('/* CARPET PLACEMENT END */')[0];
const place=vm.runInNewContext(script+'\ncarpetPlacement;');
test('all six prayer spots and both walking directions stay within the central carpet',()=>{
 const spots=new Set();
 for(let slot=0;slot<6;slot++){
  const p=place(slot);spots.add(p.targetX+':'+p.targetY);
  for(let step=0;step<=20;step++){
   const t=step/20;
   for(const [x,y] of [[p.startX+(p.targetX-p.startX)*t,p.startY+(p.targetY-p.startY)*t],[p.targetX+(p.exitX-p.targetX)*t,p.targetY+(p.exitY-p.targetY)*t]]){
    // Conservative central safe area, leaving clearance for the character footprint.
    assert.ok(x>=40&&x<=64);assert.ok(y>=74&&y<=104);
   }
  }
 }
 assert.equal(spots.size,6);
});
