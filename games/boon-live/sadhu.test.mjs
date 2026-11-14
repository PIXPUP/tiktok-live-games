import test from 'node:test';
import assert from 'node:assert/strict';
import {SadhuRouter} from './tikfinity-bridge.mjs';
test('Sadhu chat recognizes real sender names, polite suffixes and nested users',()=>{
 const router=new SadhuRouter();
 assert.equal(router.route({comment:'สาธุค่ะ 🙏',nickname:'มะลิ',userId:'1'}).name,'มะลิ');
 const nested=router.route({comment:'สา ธุ',user:{nickname:'ใจดี',userId:'2'}});assert.equal(nested.action,'sadhu');assert.equal(nested.name,'ใจดี');
 assert.equal(router.route({comment:'hello',nickname:'other'}),null);
 assert.equal(router.route({comment:'สาธุ'}),null);
 assert.equal(router.route({comment:'สาธุ',nickname:'no-id-one',userId:0}).userId,'no-id-one');
 assert.equal(router.route({comment:'สาธุ',nickname:'no-id-two',userId:0}).name,'no-id-two');
});
test('one sender is throttled for 30 seconds while other senders remain eligible',()=>{
 let now=0;const router=new SadhuRouter({now:()=>now});const event={comment:'สาธุ',user:{nickname:'same name',userId:'1'}};
 assert.ok(router.route(event));now=29999;assert.equal(router.route(event),null);
 assert.ok(router.route({...event,user:{nickname:'same name',userId:'2'}}));now=30000;assert.ok(router.route(event));
 for(let i=0;i<700;i++)router.route({comment:'สาธุ',nickname:'viewer',userId:'user-'+i});assert.equal(router.seen.size,500);
});
