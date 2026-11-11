import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const game of ['boon-live','ganesha-live']){
 const source=fs.readFileSync(new URL(`../games/${game}/game.js`,import.meta.url),'utf8');
 const pick=vm.runInNewContext(source.split('/* AVATAR PRIORITY START */')[1].split('/* AVATAR PRIORITY END */')[0]+';avatarAdmission;');
 test(`${game}: real gifts replace demos and demos cannot evict real names`,()=>{
  const people=[[1,{demo:false}],[2,{demo:true}],[3,{demo:false}],[4,{demo:true}]];
  assert.equal(pick(people,false,4).victim,2);
  assert.equal(pick(people,true,4).victim,2);
  const real=people.map(([id])=>[id,{demo:false}]);
  assert.equal(pick(real,true,4).allowed,false);
  assert.equal(pick(real,false,4).allowed,true);
 });
}
const source=fs.readFileSync(new URL('../games/curry-shop-3d/game.js',import.meta.url),'utf8');
const Queue=vm.runInNewContext(source.split('// ORDER QUEUE START')[1].split('// ORDER QUEUE END')[0].replace('export class','class')+';OrderQueue;');
test('curry shop keeps real gifts FIFO ahead of waiting demos',()=>{
 const queue=new Queue();queue.enqueue({action:'incense',name:'demo1',count:1},true);queue.next();
 queue.enqueue({action:'tree',name:'demo2',count:1},true);
 queue.enqueue({action:'lamp',name:'real1',count:1});queue.enqueue({action:'fruit',name:'real2',count:1});
 queue.enqueue({action:'tree',name:'demo3',count:1},true);
 queue.finish();assert.equal(queue.next().name,'real1');queue.finish();assert.equal(queue.next().name,'real2');queue.finish();assert.equal(queue.next().name,'demo2');
});
