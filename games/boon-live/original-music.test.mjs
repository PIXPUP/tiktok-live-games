import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* ORIGINAL MUSIC ENGINE START */')[1].split('/* ORIGINAL MUSIC ENGINE END */')[0];
const create=vm.runInNewContext(script+'\ncreateOriginalMusic;',{setInterval,clearInterval,setTimeout,clearTimeout});
function setup(){
 const contexts=[],intervals=new Map(),timers=new Map();let id=0;
 const param=()=>({value:0,targets:[],cancelScheduledValues(){},setValueAtTime(value){this.value=value;},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value;this.targets.push(value);}});
 const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),delayTime:param()});
 class Context{
  constructor(){this.currentTime=0;this.destination={};this.gains=[];this.oscillators=[];this.resumes=0;this.suspends=0;contexts.push(this);}
  createGain(){const n=node();this.gains.push(n);return n;}
  createDelay(){return node();}createBiquadFilter(){return node();}
  createOscillator(){const n={...node(),starts:[],stops:[],start(time){this.starts.push(time);},stop(time){this.stops.push(time);}};this.oscillators.push(n);return n;}
  async resume(){this.resumes++;}async suspend(){this.suspends++;}
 }
 const engine=create({AudioContext:Context,interval:fn=>{intervals.set(++id,fn);return id;},clearIntervalFn:key=>intervals.delete(key),timer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key)});
 return {engine,contexts,intervals,timers};
}
test('music reuses one context, schedules notes and stops its scheduler',async()=>{
 const {engine,contexts,intervals,timers}=setup();assert.equal(engine.getState().running,false);
 assert.equal(await engine.start(),true);assert.equal(contexts.length,1);assert.equal(contexts[0].oscillators.length,6);
 assert.equal(await engine.start(),true);assert.equal(contexts.length,1);assert.equal(intervals.size,1);
 engine.stop();assert.equal(intervals.size,0);assert.equal(contexts[0].gains[0].gain.value,0);
 for(const callback of timers.values())callback();assert.equal(contexts[0].suspends,1);
 await engine.start();assert.equal(contexts.length,1);engine.stop();
});
test('speech ducks music to 20 percent and restores configured volume',async()=>{
 const {engine,contexts}=setup();engine.configure({volume:.5});await engine.start();
 const gain=contexts[0].gains[0].gain;assert.equal(gain.value,.5);
 engine.duck(true);assert.equal(gain.value,.1);engine.duck(false);assert.equal(gain.value,.5);
 engine.configure({autoDuck:false});engine.duck(true);assert.equal(gain.value,.5);
 engine.configure({volume:2});assert.equal(engine.getState().volume,.7);engine.stop();
});
test('unsupported browsers fail without starting audio',async()=>{
 const engine=create({AudioContext:null});assert.equal(await engine.start(),false);assert.equal(engine.getState().running,false);
});
