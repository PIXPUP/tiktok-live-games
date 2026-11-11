import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./game.js',import.meta.url),'utf8').split('/* CHARACTER SELECTION START */')[1].split('/* CHARACTER SELECTION END */')[0];
const pick=vm.runInNewContext(source+';characterForViewer;');
test('viewer keeps one of four characters, including after normalization',()=>{
 assert.equal(pick('หมูเฮง'),pick('หมูเฮง'));assert.equal(pick(' Alice '),pick('alice'));
 const variants=new Set();for(let i=0;i<100;i++){const v=pick('ผู้ชม'+i);assert.ok(v>=0&&v<4);variants.add(v);}assert.equal(variants.size,4);
});
