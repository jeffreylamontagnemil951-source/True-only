import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
test("health endpoint responds without requiring a database",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/health"),{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,service:"trueonly-api"});
});
test("health endpoint rejects unsupported methods",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/health",{method:"POST"}),{});
  assert.equal(response.status,405);
});
test("unknown API route requires an authenticated school identity",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/not-real"),{DB:{}});
  assert.equal(response.status,401);
});
test("static asset requests return a clear setup response without an asset binding",async()=>{
  const response=await worker.fetch(new Request("https://example.test/"),{});
  assert.equal(response.status,503);
  assert.match(await response.text(),/static assets binding is not configured/);
});
