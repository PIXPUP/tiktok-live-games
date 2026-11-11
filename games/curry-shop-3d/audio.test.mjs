import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const code=source.split('// ORIGINAL RESTAURANT AUDIO START')[1].split('// ORIGINAL RESTAURANT AUDIO END')[0];
const {createRestaurantAudio,composeIdleMusic}=await import('data:text/javascript,'+encodeURIComponent(code));
function context(){
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value;}});
 const ctx={currentTime:0,state:'suspended',sampleRate:1000,destination:{},nodes:[],closed:false,async resume(){this.state='running';},async close(){this.closed=true;this.state='closed';}};
 const node=()=>({gain:param(),frequency:param(),connect(n){return n;},disconnect(){},start(){this.started=true;},stop(at){this.stopped=true;if(at===undefined)this.onended?.();}});
 ctx.createGain=()=>node();ctx.createDynamicsCompressor=()=>node();ctx.createBiquadFilter=()=>node();
 ctx.createBuffer=(_channels,length)=>({getChannelData:()=>new Float32Array(length)});
 ctx.createOscillator=ctx.createBufferSource=()=>{const n=node();ctx.nodes.push(n);return n;};return ctx;
}
test('audio requires explicit start, handles all effects, throttles footsteps and closes every source',async()=>{
 let allocations=0,ctx;const audio=createRestaurantAudio(()=>{allocations++;ctx=context();return ctx;});
 assert.equal(audio.play('order'),false);assert.equal(allocations,0);
 audio.setVolume(.4);await audio.start();assert.equal(audio.getState().enabled,true);assert.equal(audio.getState().volume,.4);assert.equal(audio.getState().musicPlaying,true);audio.setMusicVolume(.2);assert.equal(audio.getState().musicVolume,.2);audio.setMusicEnabled(false);assert.equal(audio.getState().musicPlaying,false);assert.equal(audio.getState().enabled,true);audio.setMusicEnabled(true);assert.equal(audio.getState().musicPlaying,true);
 assert.equal(audio.play('step'),true);assert.equal(audio.play('step'),false);ctx.currentTime=.2;assert.equal(audio.play('step'),true);
 for(const kind of ['scoop','plate','seat','serve','celebrate']){ctx.currentTime+=2;assert.equal(audio.play(kind),true);}
 assert.ok(audio.getState().active<=14,'limit overlapping sounds');
 audio.setVolume(2);assert.equal(audio.getState().volume,1);audio.setVolume(-1);assert.equal(audio.getState().volume,0);
 await audio.stop();assert.equal(ctx.closed,true);assert.equal(audio.getState().active,0);assert.ok(ctx.nodes.every(n=>n.stopped));assert.equal(audio.play('serve'),false);
 await audio.start();assert.equal(allocations,2);assert.equal(audio.getState().enabled,true);await audio.stop();
});

test('idle loop contains finite stereo audio with headroom and a continuous loop boundary',()=>{
 const ctx={createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,getChannelData:i=>data[i]};}};
 const buffer=composeIdleMusic(ctx);assert.equal(buffer.numberOfChannels,2);assert.ok(buffer.length/buffer.sampleRate>40);
 let peak=0,energy=0;for(const channel of [0,1]){const data=buffer.getChannelData(channel);for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}assert.ok(Math.abs(data[0]-data.at(-1))<.05,'no large seam click');}
 assert.ok(peak>.05&&peak<.95,'audible signal with clipping headroom');assert.ok(energy>1);
});
