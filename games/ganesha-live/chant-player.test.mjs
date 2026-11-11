import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* LICENSED CHANT PLAYER START */')[1].split('/* LICENSED CHANT PLAYER END */')[0];
const create=vm.runInNewContext(script+'\ncreateChantPlayer;');
test('chant loops after user start, ducks for speech, restores volume and pauses',async()=>{
 let created=0,paused=0;const audio={volume:0,addEventListener(){},async play(){},pause(){paused++;}};
 const p=create({source:'licensed-audio',createAudio:()=>{created++;return audio;}});
 assert.equal(created,0);assert.equal(await p.start(),true);assert.equal(audio.loop,true);assert.equal(audio.src,'licensed-audio');p.configure(.5);assert.equal(audio.volume,.5);p.duck(true);assert.equal(audio.volume,.09);p.duck(false);assert.equal(audio.volume,.5);p.stop();assert.equal(paused,1);assert.equal(p.getState().running,false);
 await p.start();assert.equal(created,1);p.stop();
});
test('late play resolution cannot restart a stopped chant',async()=>{
 let resolve;const p=create({source:'licensed-audio',createAudio:()=>({addEventListener(){},play:()=>new Promise(r=>resolve=r),pause(){}})});
 const start=p.start();p.stop();resolve();assert.equal(await start,false);assert.equal(p.getState().running,false);
});
