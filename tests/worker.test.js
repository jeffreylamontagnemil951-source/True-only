import test from "node:test";
import assert from "node:assert/strict";
import worker,{SupportRoom,canViewSupportTicket,pageSupportMessages,supportMessageLimit,supportViewerAllowed} from "../src/index.js";
test("health endpoint responds without D1",async()=>{const r=await worker.fetch(new Request("https://example.test/api/health"),{});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,service:"trueonly-api"})});
test("health endpoint rejects unsupported methods",async()=>{const r=await worker.fetch(new Request("https://example.test/api/health",{method:"POST"}),{});assert.equal(r.status,405)});
test("unknown API route requires authentication",async()=>{const r=await worker.fetch(new Request("https://example.test/api/not-real"),{DB:{}});assert.equal(r.status,401)});
test("static asset request gives setup response without binding",async()=>{const r=await worker.fetch(new Request("https://example.test/"),{});assert.equal(r.status,503)});
test("support room rejects unknown routes",async()=>{const room=new SupportRoom({getWebSockets:()=>[]},{});assert.equal((await room.fetch(new Request("https://room/nope"))).status,404)});
test("support room broadcasts only message IDs to matching authorized school and ticket sockets",async()=>{const sent=[];const socket=(school,ticket,admin)=>({deserializeAttachment:()=>({school_id:school,ticket_id:ticket,admin_id:admin}),send:x=>sent.push(JSON.parse(x))});const room=new SupportRoom({getWebSockets:()=>[socket("s1","t1","a1"),socket("s1","t2","a1")]},{DB:{prepare(){return{bind(){return{first:async()=>({id:"m"}),all:async()=>({results:[{id:"a1"}]})}}}}}});const r=await room.fetch(new Request("https://room/publish",{method:"POST",headers:{"content-type":"application/json","x-trueonly-school":"s1","x-trueonly-ticket":"t1"},body:JSON.stringify({type:"message.created",message:{id:"m",body:"private text"}})}));assert.equal(r.status,204);assert.deepEqual(sent,[{type:"message.created",message:{id:"m"}}])});
test("support staff visibility is restricted by assignment and school",()=>{const t={school_id:"s1",requester_admin_id:"r",assigned_admin_id:"a"};assert.equal(canViewSupportTicket({id:"a",role:"support",school_id:"s1"},t),true);assert.equal(canViewSupportTicket({id:"x",role:"support",school_id:"s1"},t),false);assert.equal(canViewSupportTicket({id:"a",role:"support",school_id:"s2"},t),false)});

test("cross-origin write requests are rejected before authentication",async()=>{const r=await worker.fetch(new Request("https://example.test/api/students",{method:"POST",headers:{origin:"https://attacker.test","content-type":"application/json"},body:"{}"}),{DB:{}});assert.equal(r.status,403)});
test("same-origin writes still require an authenticated school administrator",async()=>{const r=await worker.fetch(new Request("https://example.test/api/students",{method:"POST",headers:{origin:"https://example.test","content-type":"application/json"},body:"{}"}),{DB:{}});assert.equal(r.status,401)});

test("support ticket visibility grants school leads and restricts staff to requester or assignee",()=>{
 const ticket={school_id:"school-a",requester_admin_id:"requester",assigned_admin_id:"assignee"};
 assert.equal(canViewSupportTicket({id:"lead",role:"admin",school_id:"school-a"},ticket),true);
 assert.equal(canViewSupportTicket({id:"requester",role:"support",school_id:"school-a"},ticket),true);
 assert.equal(canViewSupportTicket({id:"assignee",role:"support",school_id:"school-a"},ticket),true);
 assert.equal(canViewSupportTicket({id:"other",role:"support",school_id:"school-a"},ticket),false);
 assert.equal(canViewSupportTicket({id:"lead",role:"admin",school_id:"school-b"},ticket),false);
});
test("support message pagination returns stable chronological pages and an older cursor",()=>{
 assert.deepEqual(pageSupportMessages([{id:"m3"},{id:"m2"},{id:"m1"}],2),{messages:[{id:"m2"},{id:"m3"}],has_more:true,next_before:"m2"});
 assert.deepEqual(pageSupportMessages([{id:"m2"},{id:"m1"}],2),{messages:[{id:"m1"},{id:"m2"}],has_more:false,next_before:null});
 assert.deepEqual(pageSupportMessages([],50),{messages:[],has_more:false,next_before:null});
});
test("support message page size is bounded",()=>{
 assert.equal(supportMessageLimit(null),50);assert.equal(supportMessageLimit("8"),8);
 assert.equal(supportMessageLimit("999"),50);assert.equal(supportMessageLimit("0"),1);
 assert.equal(supportMessageLimit("bad"),50);
});
test("live support authorization rechecks school, active account, assignment and read override",async()=>{
 let sql="",args=[];
 const env={DB:{prepare(q){sql=q;return{bind(...values){args=values;return{first:async()=>({id:"staff-a"})}}}}}};
 assert.equal(await supportViewerAllowed(env,"school-a","ticket-a","staff-a"),true);
 assert.match(sql,/a\.school_id=t\.school_id/);assert.match(sql,/a\.active=1/);
 assert.match(sql,/t\.assigned_admin_id=a\.id/);assert.match(sql,/po\.allowed/);
 assert.deepEqual(args,["ticket-a","school-a","staff-a"]);
 const denied={DB:{prepare(){return{bind(){return{first:async()=>null}}}}}};
 assert.equal(await supportViewerAllowed(denied,"school-a","ticket-a","staff-b"),false);
});
test("support room refuses WebSocket upgrades without current D1 authorization",async()=>{
 const room=new SupportRoom({getWebSockets:()=>[],acceptWebSocket:()=>{}},{DB:{prepare(){return{bind(){return{first:async()=>null}}}}}});
 const r=await room.fetch(new Request("https://room/api/support/t1/live",{headers:{upgrade:"websocket","x-trueonly-school":"s1","x-trueonly-ticket":"t1","x-trueonly-admin":"a1"}}));
 assert.equal(r.status,403);
});
test("support room rejects publish events that do not identify a created message",async()=>{
 const room=new SupportRoom({getWebSockets:()=>[]},{DB:{}});
 const r=await room.fetch(new Request("https://room/publish",{method:"POST",headers:{"content-type":"application/json","x-trueonly-school":"s1","x-trueonly-ticket":"t1"},body:JSON.stringify({type:"anything"})}));
 assert.equal(r.status,400);
});
test("support room rechecks live subscribers and closes sockets after access is revoked",async()=>{
 const sent=[],closed=[];
 const socket=(school,ticket,admin)=>({deserializeAttachment:()=>({school_id:school,ticket_id:ticket,admin_id:admin}),send:x=>sent.push(JSON.parse(x)),close:(code,reason)=>closed.push({code,reason})});
 const room=new SupportRoom({getWebSockets:()=>[socket("s1","t1","a1"),socket("s1","t1","a2"),socket("s1","t2","a1"),socket("s2","t1","a1")]},{
  DB:{prepare(){return{bind(){return{first:async()=>({id:"m1"}),all:async()=>({results:[{id:"a1"}]})}}}}}
 });
 const r=await room.fetch(new Request("https://room/publish",{method:"POST",headers:{"content-type":"application/json","x-trueonly-school":"s1","x-trueonly-ticket":"t1"},body:JSON.stringify({type:"message.created",message:{id:"m1",body:"never broadcast"}})}));
 assert.equal(r.status,204);
 assert.deepEqual(sent,[{type:"message.created",message:{id:"m1"}}]);
 assert.deepEqual(closed,[{code:1008,reason:"Authorization changed"}]);
});
