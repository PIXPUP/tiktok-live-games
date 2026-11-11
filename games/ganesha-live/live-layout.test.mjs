import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const script=html.split('<script id="live-layout-bootstrap">')[1].split('</script>')[0];
function run(hostname,search,w=1080,h=1920){
 const listeners={},stage={style:{}},shell={style:{}},classes=[];
 const document={documentElement:{className:''},body:{classList:{add:c=>classes.push(c)}},getElementById:id=>id==='stage'?stage:shell,addEventListener:(name,fn)=>listeners[name]=fn};
 const window={innerWidth:w,innerHeight:h,addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(script,{window,document,location:{hostname,search}});listeners.DOMContentLoaded?.();return {window,document,stage,shell,classes,listeners};
}
test('public tunnel always shows LIVE layout even if query parameters were omitted or copied incorrectly',()=>{
 for(const search of ['','?overlay=1&transport=poll','?overiay=1&transport=poll']){const r=run('example.trycloudflare.com',search);assert.equal(r.window.__LIVE_OVERLAY__,true);assert.ok(r.document.documentElement.className.includes('live-overlay'));assert.equal(r.stage.style.transform,'scale(2.4)');assert.equal(r.stage.style.left,'0px');assert.equal(r.stage.style.top,'0px');assert.ok(r.classes.includes('overlay'));}
});
test('local control panel remains available and local overlay resizes independently of the game script',()=>{
 assert.equal(run('127.0.0.1','?v=32').window.__LIVE_OVERLAY__,false);
 const r=run('127.0.0.1','?overlay=1',450,800);assert.equal(r.stage.style.transform,'scale(1)');r.window.innerWidth=900;r.window.innerHeight=1600;r.listeners.resize();assert.equal(r.stage.style.transform,'scale(2)');
});
