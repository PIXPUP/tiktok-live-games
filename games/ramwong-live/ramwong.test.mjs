import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
test('dance floor has six separate positions inside the visible floor',()=>{
 const layout=vm.runInNewContext(source.split('/* CARPET PLACEMENT START */')[1].split('/* CARPET PLACEMENT END */')[0]+';carpetPlacement;',{lowPower:false});
 const spots=Array.from({length:6},(_,i)=>layout(i));
 assert.equal(new Set(spots.map(p=>`${p.targetX},${p.targetY}`)).size,6);
 assert.ok(spots.every(p=>p.targetX>=30&&p.targetX<=70&&p.targetY>=60&&p.targetY<=84));
});
test('pair gifts bring two dancers and grand gifts respect the low-power visual limit',()=>{
 const arrivals=[],spoken=[];
 const ctx={lowPower:false,lastRealGiftAt:-Infinity,byAction:{bell:{label:'pair'},grand:{label:'party'},incense:{label:'dance'}},$:()=>({}),giftName:()=>'',setTimeout:fn=>fn(),addPilgrim:(e,o)=>arrivals.push(o),offeringEffect(){},blessingVoice:{enqueue:e=>spoken.push(e)}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function animateEvent(e)'),source.indexOf('function showCeremony(')),ctx);
 ctx.animateEvent({action:'bell',name:'real',count:1,points:100});assert.equal(arrivals.length,2);assert.equal(arrivals[1].partner,1);assert.equal(spoken.length,1);
 arrivals.length=0;ctx.animateEvent({action:'grand',name:'real',count:1,points:1000});assert.equal(arrivals.length,4);
 arrivals.length=0;ctx.lowPower=true;ctx.animateEvent({action:'grand',name:'demo',count:1,points:0,preview:true});assert.equal(arrivals.length,2);assert.equal(spoken.length,2);
});
function player(Audio){
 const ctx={Audio};vm.createContext(ctx);return vm.runInContext(source.split('/* ORIGINAL MUSIC ENGINE START */')[1].split('/* ORIGINAL MUSIC ENGINE END */')[0]+';createOriginalMusic;',ctx)({});
}
test('original cha-cha track loops, ducks for the host, restores volume and stops',async()=>{
 let audio;
 class Audio{constructor(src){this.src=src;audio=this;}addEventListener(){}async play(){this.playing=true;}pause(){this.playing=false;}}
 const music=player(Audio);await music.start();assert.equal(audio.src,'/dance-music.wav');assert.equal(audio.loop,true);assert.equal(audio.playing,true);
 music.configure({volume:.5});music.duck(true);assert.equal(audio.volume,.1);music.duck(false);assert.equal(audio.volume,.5);music.stop();assert.equal(audio.playing,false);assert.equal(music.getState().running,false);
});
test('a delayed audio start cannot restart music after Stop',async()=>{
 let finish,audio;
 class Audio{constructor(){audio=this;}addEventListener(){}play(){return new Promise(r=>finish=r);}pause(){this.paused=true;}}
 const music=player(Audio);const pending=music.start();music.stop();finish();await pending;assert.equal(music.getState().running,false);assert.equal(audio.paused,true);
});

test('late completion of an old start cannot pause a newer playback',async()=>{
 const finishes=[];let audio;
 class Audio{constructor(){audio=this;}addEventListener(){}play(){this.paused=false;return new Promise(r=>finishes.push(r));}pause(){this.paused=true;}}
 const music=player(Audio);const first=music.start();music.stop();const second=music.start();finishes[1]();await second;finishes[0]();await first;assert.equal(music.getState().running,true);assert.equal(audio.paused,false);
});
