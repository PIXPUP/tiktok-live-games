import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* BLESSING VOICE ENGINE START */')[1].split('/* BLESSING VOICE ENGINE END */')[0];
const create=vm.runInNewContext(source+'\ncreateBlessingSpeaker;',{setTimeout,clearTimeout});
function setup(extra={}){
 let time=0,id=0;const tasks=new Map(),spoken=[],statuses=[];
 const timer=(fn,delay)=>{tasks.set(++id,{fn,at:time+delay});return id;};
 const clearTimer=key=>tasks.delete(key);
 const tick=delta=>{const end=time+delta;while(true){const next=[...tasks.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;time=next[1].at;tasks.delete(next[0]);next[1].fn();}time=end;};
 const synth={speak(u){spoken.push(u);u.onstart?.();},cancel(){},resume(){}};
 const speaker=create({synth,Utterance:class{constructor(text){this.text=text;}},timer,clearTimer,onStatus:s=>statuses.push(s),...extra});
 return {speaker,spoken,tick,statuses};
}
test('disabled by default; burst combos merge; Thai names and settings are preserved',()=>{
 const {speaker,spoken,tick}=setup();
 speaker.enqueue({name:'หมูเฮง',action:'incense',label:'ถวายดอกไม้',count:1});tick(1000);assert.equal(spoken.length,0);
 speaker.configure({volume:.6,rate:.9,voice:{name:'Thai test'}});speaker.enable();
 speaker.enqueue({name:'หมูเฮง🌟',action:'incense',label:'ถวายดอกไม้',count:2});
 speaker.enqueue({name:'หมูเฮง🌟',action:'incense',label:'ถวายดอกไม้',count:3});tick(650);
 assert.equal(spoken.length,1);assert.match(spoken[0].text,/คุณหมูเฮง/);assert.match(spoken[0].text,/จำนวน 5 ครั้ง/);
 assert.equal(spoken[0].volume,.6);assert.equal(spoken[0].rate,.9);assert.equal(spoken[0].lang,'th-TH');
});
test('voices never overlap; disabling clears pending gifts and ignores late callbacks',()=>{
 const {speaker,spoken,tick}=setup();speaker.enable();speaker.preview('หมูเฮง');
 speaker.enqueue({name:'แสงดาว',action:'lamp',label:'จุดประทีป',count:1});tick(5000);assert.equal(spoken.length,1);
 spoken[0].onend();tick(300);assert.equal(spoken.length,2);assert.match(spoken[1].text,/แสงดาว/);
 speaker.enqueue({name:'ใจดี',action:'tree',label:'ถวายผลไม้',count:1});speaker.disable();spoken[1].onend();tick(5000);
 assert.equal(spoken.length,2);assert.equal(speaker.getState().queued,0);assert.equal(speaker.getState().enabled,false);
});
test('read-name option, bounded queue, autoplay denial and unavailable speech API',()=>{
 const {speaker,spoken,tick}=setup();speaker.configure({readName:false});speaker.enable();speaker.preview('ชื่อที่ไม่อ่าน');
 assert.doesNotMatch(spoken[0].text,/ชื่อที่ไม่อ่าน/);
 for(let i=0;i<30;i++)speaker.enqueue({name:'ผู้ชม'+i,action:'temple',label:'ถวายขนมโมทกะ',count:1});
 assert.equal(speaker.getState().queued,12);
 spoken[0].onerror({error:'not-allowed'});tick(5000);assert.equal(speaker.getState().enabled,false);assert.equal(spoken.length,1);
 const unsupported=create({synth:null,Utterance:null});assert.equal(unsupported.enable(),false);
});
test('ceremonial host thanks the named sender, wishes health and varies the greeting',()=>{
 const {speaker,spoken,tick}=setup();speaker.enable();speaker.preview('แสงดาว');
 assert.match(spoken[0].text,/ขอขอบคุณคุณแสงดาว/);assert.match(spoken[0].text,/สุขภาพแข็งแรง/);assert.match(spoken[0].text,/ถวายดอกไม้/);
 const first=spoken[0].text;spoken[0].onend();tick(300);speaker.configure({ending:'ค่ะ'});speaker.preview('แสงดาว');
 assert.notEqual(spoken[1].text,first);assert.match(spoken[1].text,/นะคะ/);assert.match(spoken[1].text,/ค่ะ$/);assert.doesNotMatch(spoken[1].text,/นะค่ะ/);
 speaker.disable();
});
test('ambient host rotates welcomes with a quiet gap and does not invent donors',()=>{
 const {speaker,spoken,tick}=setup();speaker.enable();assert.equal(speaker.startAmbient(),true);
 assert.match(spoken[0].text,/ขอต้อนรับทุกท่าน/);assert.doesNotMatch(spoken[0].text,/ร่วมถวายดอกไม้/);
 const first=spoken[0].text;spoken[0].onend();tick(20299);assert.equal(spoken.length,1);tick(1);
 assert.equal(spoken.length,2);assert.notEqual(spoken[1].text,first);speaker.disable();tick(60000);assert.equal(spoken.length,2);
});
test('real gifts interrupt the ambient host and the loop resumes after the gift',()=>{
 const {speaker,spoken,tick}=setup();speaker.enable();speaker.startAmbient();
 const welcome=spoken[0];speaker.enqueue({name:'ใจดี',action:'temple',label:'ถวายขนมโมทกะ',count:1});tick(650);
 assert.equal(spoken.length,2);assert.match(spoken[1].text,/คุณใจดี/);welcome.onend();assert.equal(speaker.getState().speaking,true);
 spoken[1].onend();tick(20300);assert.equal(spoken.length,3);assert.match(spoken[2].text,/ยินดีต้อนรับ/);
 speaker.stopAmbient();assert.equal(speaker.getState().ambientLoop,false);tick(60000);assert.equal(spoken.length,3);
});

test('gift invitations use current bindings, honor mode, and yield immediately to a real gift',()=>{
 let gift='กุหลาบ';const {speaker,spoken,tick}=setup({getGiftInvitations:()=>[`ส่ง${gift}เพื่อร่วมถวายดอกไม้ในเกม{soft} ไม่ใช่การบริจาคให้วัด{end}`]});
 speaker.configure({ambientMode:'cheer',ending:'ค่ะ'});speaker.enable();speaker.startAmbient();
 assert.match(spoken[0].text,/กุหลาบ/);assert.match(spoken[0].text,/ในเกม/);assert.match(spoken[0].text,/นะคะ/);
 const invitation=spoken[0];speaker.enqueue({name:'ใจดี',action:'temple',label:'ถวายขนมโมทกะ',count:1});tick(650);assert.match(spoken[1].text,/คุณใจดี/);invitation.onend();assert.equal(speaker.getState().speaking,true);
 gift='มินิฮาร์ต';spoken[1].onend();tick(20300);assert.match(spoken[2].text,/มินิฮาร์ต/);
 speaker.stopAmbient();speaker.configure({ambientMode:'welcome'});speaker.startAmbient();assert.doesNotMatch(spoken.at(-1).text,/มินิฮาร์ต/);speaker.disable();tick(60000);assert.equal(speaker.getState().ambientLoop,false);
});

test('Ganesha prayer is read in full and is not stopped by the short greeting timeout',()=>{
 const {speaker,spoken,tick}=setup();speaker.configure({ambientMode:'ganesha'});speaker.enable();speaker.startAmbient();
 assert.equal(spoken.length,1);assert.ok(spoken[0].text.startsWith('พระพิฆเนศ เทพแห่งความสำเร็จ'));assert.ok(spoken[0].text.endsWith('ด้วยเทอญ'));assert.ok(spoken[0].text.includes('สำเร็จ สำเร็จ สำเร็จ'));tick(41000);assert.equal(speaker.getState().speaking,true);speaker.stop();
});
