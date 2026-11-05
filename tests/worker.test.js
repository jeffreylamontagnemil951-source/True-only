import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
test("health endpoint responds without requiring a database",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/health"),{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,service:"trueonly-api"});
});
test("unknown API route returns 404",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/not-real"),{DB:{}});
  assert.equal(response.status,401);
});
