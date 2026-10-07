import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

const server = createServer((req, res) => {
  req.resume();
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  res.write(`${JSON.stringify({ response: "partial ", done: false })}\n`);
  // Never finishes: the client deadline must cut it off.
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
process.env.OLLAMA_HOST = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const { generateResult, startDeadline } = await import("./ollama-client.js");

test("timeout keeps the text streamed so far", async () => {
  const result = await generateResult("m", "p", "s", undefined, false, undefined, 1000);
  assert.equal(result.text, "partial ");
  assert.equal(result.completion.status, "incomplete");
  assert.equal(result.completion.done_reason, "timeout");
});

test("deadline counts time spent before generation", async () => {
  const clock = startDeadline(1000);
  await new Promise((r) => setTimeout(r, 1100));
  assert.throws(() => clock.remaining(), { code: "ECONNABORTED" });
});

test.after(() => server.close());
