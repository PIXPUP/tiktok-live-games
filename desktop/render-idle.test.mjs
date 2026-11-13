import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const game of ['boon-live','ganesha-live','alms-live','ramwong-live']){
 test(`${game}: idle polls skip DOM work, gifts and resets still redraw`,()=>{
  const source=fs.readFileSync(new URL(`../games/${game}/game.js`,import.meta.url),'utf8');
  let writes=0,rankings=0;
  const nodes=new Map();
  const $=id=>{if(!nodes.has(id)){const node={style:{},replaceChildren(){}};Object.defineProperty(node,'textContent',{set(){writes++;}});nodes.set(id,node);}return nodes.get(id);};
  const ctx={$ ,latestState:null,knownCeremony:0,leaderboardRows:()=>rankings++,showCeremony(){}};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('let lastRenderedKey=null;'),source.indexOf('/* CARPET PLACEMENT START */')),ctx);
  const state={score:0,actions:0,players:{},recent:[]};
  ctx.render(state);const first=writes;
  for(let i=0;i<20;i++)ctx.render({...state});
  assert.equal(writes,first);assert.equal(rankings,1);
  ctx.render({...state,score:5,actions:1});assert.equal(rankings,2);
  ctx.knownCeremony=null;ctx.render({...state,score:5,actions:1});assert.equal(rankings,3);
 });
}
