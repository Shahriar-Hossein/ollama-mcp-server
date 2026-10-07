import assert from "node:assert/strict";
import { isCloudModel, runExclusive } from "./request-queue.js";

let running = 0;
let peak = 0;
const job = async () => {
  peak = Math.max(peak, ++running);
  await new Promise((r) => setTimeout(r, 50));
  running--;
};
await Promise.all([1, 2, 3].map(() => runExclusive(undefined, job)));
assert.equal(peak, 1, "jobs overlapped");

const slow = runExclusive(undefined, () => new Promise((r) => setTimeout(r, 600)));
await assert.rejects(
  runExclusive(150, async () => {}),
  /queue timeout/,
);
await slow;
await runExclusive(1000, async () => {});

assert.ok(
  isCloudModel("gemma4:31b-cloud") && isCloudModel("x:cloud") && !isCloudModel("qwen3.5:4b"),
);
console.log("request-queue ok");
