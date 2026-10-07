import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_DIR = process.env.OLLAMA_QUEUE_LOCK ?? join(tmpdir(), "ollama-mcp-local.lock");
const POLL_MS = 200;
const MAX_WAIT_MS = 600_000;

export const isCloudModel = (model: string) => /(:|-)cloud$/.test(model);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error.code === "EPERM";
  }
};

function tryLock(): boolean {
  try {
    mkdirSync(LOCK_DIR);
  } catch (error: any) {
    if (error.code !== "EEXIST") throw error;
    let owner = NaN;
    try {
      owner = Number(readFileSync(join(LOCK_DIR, "pid"), "utf8"));
    } catch {}
    // Owner may still be writing its pid; only steal a lock whose owner is gone.
    if (Number.isFinite(owner) && !alive(owner)) rmSync(LOCK_DIR, { recursive: true, force: true });
    return false;
  }
  writeFileSync(join(LOCK_DIR, "pid"), String(process.pid));
  return true;
}

let tail: Promise<unknown> = Promise.resolve();

/** Runs `job` once no other local-model job (this process or another) is running. */
export async function runExclusive<T>(
  waitMs: number | undefined,
  job: () => Promise<T>,
): Promise<T> {
  const give = Date.now() + (waitMs ?? MAX_WAIT_MS);
  const prev = tail;
  let release!: () => void;
  tail = new Promise<void>((r) => (release = r));
  try {
    await Promise.race([
      prev,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error("queue timeout"), { code: "ECONNABORTED" })),
          Math.max(0, give - Date.now()),
        ).unref(),
      ),
    ]);
    while (!tryLock()) {
      if (Date.now() >= give)
        throw Object.assign(new Error("queue timeout"), { code: "ECONNABORTED" });
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } catch (error) {
    // Pass the turn on so a timed-out waiter doesn't block those behind it.
    prev.then(release, release);
    throw error;
  }
  try {
    return await job();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
    release();
  }
}
