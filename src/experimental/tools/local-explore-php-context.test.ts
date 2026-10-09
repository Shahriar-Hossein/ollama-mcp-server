import assert from "node:assert/strict";
import test from "node:test";
import { phpFilenameAnchors } from "./local-explore-php-context.js";

const tracked = ["app/startup.php", "lib/shared.php", "app/shared.php", "settings/options.php"];

test("bare PHP basenames require one distinct tracked path", () => {
  assert.deepEqual(phpFilenameAnchors("startup.php shared.php missing.php unrelated", tracked), {
    files: ["app/startup.php"], ambiguous: ["shared.php"],
  });
  assert.deepEqual(phpFilenameAnchors("startup.php", ["app/startup.php", "app/startup.php"]), {
    files: ["app/startup.php"], ambiguous: [],
  });
});

test("qualified PHP mentions match exactly without basename fallback", () => {
  assert.deepEqual(phpFilenameAnchors("lib/shared.php elsewhere/startup.php", tracked), {
    files: ["lib/shared.php"], ambiguous: [],
  });
});

test("quoted and punctuated complete PHP mentions keep mention order", () => {
  assert.deepEqual(phpFilenameAnchors("Read (`options.php`), then 'startup.php'; shared.php!", tracked), {
    files: ["settings/options.php", "app/startup.php"], ambiguous: ["shared.php"],
  });
  assert.deepEqual(phpFilenameAnchors('"startup.php". [options.php]:', tracked), {
    files: ["app/startup.php", "settings/options.php"], ambiguous: [],
  });
});

test("unsafe query paths never expose their basename as a hint", () => {
  for (const query of [
    "../startup.php", "app/../startup.php", "./startup.php", "/app/startup.php",
    "C:\\app\\startup.php", "C:/app/startup.php", "app\\startup.php",
    "https://example.test/startup.php", "app//startup.php",
  ]) {
    assert.deepEqual(phpFilenameAnchors(query, tracked), { files: [], ambiguous: [] }, query);
  }
});

test("unsafe tracked paths cannot create matches or ambiguity", () => {
  assert.deepEqual(phpFilenameAnchors("startup.php", [
    "../startup.php", "./startup.php", "/startup.php", "C:\\startup.php",
    "app/../startup.php", "app//startup.php", "app/startup.php",
  ]), { files: ["app/startup.php"], ambiguous: [] });
});

test("filename matching is case sensitive and excludes PHP substrings", () => {
  assert.deepEqual(phpFilenameAnchors("Startup.php startup.phpSuffix startup.php.md startup.php/extra", tracked), {
    files: [], ambiguous: [],
  });
});

test("repeated anchors are unique and the two-file cap retains first mentions", () => {
  assert.deepEqual(phpFilenameAnchors(
    "startup.php app/startup.php startup.php options.php lib/shared.php shared.php shared.php",
    tracked,
  ), { files: ["app/startup.php", "settings/options.php"], ambiguous: ["shared.php"] });
});
