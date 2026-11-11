import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8');
const code=source.split('// SELLER VOICE START')[1].split('// SELLER VOICE END')[0];
const {createSellerVoice}=await import('data:text/javascript,'+encodeURIComponent(code));
test('seller thanks the named customer, queues speech, ducks music and cancels safely',()=>{
 const utterances=[],duck=[],timers=new Map();let n=0,cancels=0;
 const synth={getVoices:()=>[{lang:'th-TH',name:'Thai Female',voiceURI:'thai'}],speak:u=>{utterances.push(u);u.onstart();},cancel:()=>cancels++};
 const voice=createSellerVoice({synth,Utterance:class{constructor(text){this.text=text;}},onSpeaking:value=>duck.push(value),setTimer:cb=>{timers.set(++n,cb);return n;},clearTimer:id=>timers.delete(id)});
 voice.thank({name:'ก่อนเปิด'});assert.equal(utterances.length,0);assert.equal(voice.enable(),true);
 voice.thank({name:'มะลิ'});voice.thank({name:'ต้นข้าว'});assert.equal(utterances.length,1);assert.match(utterances[0].text,/ขอบคุณคุณมะลิ/);assert.match(utterances[0].text,/ทานให้อร่อย/);assert.equal(utterances[0].voice.voiceURI,'thai');assert.equal(duck.at(-1),true);
 utterances[0].onend();assert.equal(utterances.length,2);assert.match(utterances[1].text,/ต้นข้าว/);
 for(let i=0;i<20;i++)voice.thank({name:'ลูกค้า'+i});assert.equal(voice.getState().queued,5);
 const stale=utterances[1];voice.disable();stale.onend();assert.equal(voice.getState().enabled,false);assert.equal(voice.getState().speaking,false);assert.equal(voice.getState().queued,0);assert.equal(duck.at(-1),false);assert.equal(timers.size,0);assert.equal(cancels,1);
});
test('missing Thai voice does not pretend speech is enabled',()=>{
 const voice=createSellerVoice({synth:{getVoices:()=>[]},Utterance:class{}});
 assert.equal(voice.enable(),false);assert.equal(voice.getState().enabled,false);
});
