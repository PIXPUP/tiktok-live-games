import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const ctx={window:{},addEventListener(){}};vm.runInNewContext(fs.readFileSync(new URL('./gift-layout.js',import.meta.url),'utf8'),ctx);
const api=ctx.window.LiveGiftLayout,catalog=JSON.parse(fs.readFileSync(new URL('../gift-library/catalog.json',import.meta.url),'utf8'));
const c=api.initial('boon-live');c.slots[0]='id-6369';c.layout.position='right';const valid=api.normalize(c,'boon-live');assert.equal(api.giftsFor(valid,catalog)[0].name,'Lion');
let bindings=api.actions.map((action,i)=>({action,gift:api.giftsFor(valid,catalog)[i].id||api.giftsFor(valid,catalog)[i].name}));assert.equal(api.matching(valid,catalog,bindings),true);bindings[0].gift='Rose';assert.equal(api.matching(valid,catalog,bindings),false);
for(const mutate of [x=>x.slots[0]='<script>',x=>x.slots[0]=x.slots[1],x=>x.game='ramwong-live',x=>x.layout.font=100,x=>x.layout.top=NaN]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>api.normalize(bad,'boon-live'));}
console.log('Gift layout validation, image selection, routing mismatch and invalid input tests passed');
