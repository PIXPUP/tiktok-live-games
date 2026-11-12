import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
function scene(){
 const classes=new Set(), monk={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},style:{}}, liveAvatars=new Map(), food={style:{setProperty(k,v){this[k]=v;}}};
 const timers=[];
 const ctx={$:()=>monk,liveAvatars,byAction:{incense:{icon:'🍚'}},effectNode:()=>food,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},setInterval:()=>{}};
 vm.createContext(ctx);vm.runInContext(source.split('/* ALMS CEREMONY START */')[1].split('/* ALMS CEREMONY END */')[0],ctx);
 return {ctx,classes,monk,liveAvatars,food,timers};
}
test('monk waits at the bowl position while visitors approach',()=>{
 const s=scene();s.liveAvatars.set('real',{});s.ctx.walkMonk();assert.equal(s.classes.has('walking'),false);
 s.classes.add('walking');s.ctx.prepareMonk();assert.equal(s.monk.style.left,'52%');assert.equal(s.classes.has('walking'),false);
});
test('receiving food changes pose and restores it after the offering',()=>{
 const s=scene();s.ctx.receiveAlms({action:'incense'},42,76);assert.equal(s.classes.has('receiving'),true);assert.equal(s.food.style['--food-x'],'45px');s.timers.at(-1)();assert.equal(s.classes.has('receiving'),false);
});
