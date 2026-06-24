import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// MNT: @entviz/core backs @entviz/react, which is meant to run in a browser.
// Hashing/encoding therefore go through @noble/hashes + the isomorphic helpers
// in bytes.ts — NOT node:crypto, node:fs, or Buffer, which a browser bundler
// can't resolve. This guard fails the build the instant a Node-only primitive
// creeps back into the browser surface, so the portability can't silently rot.
//
// cli.ts is excluded on purpose: it is the conformance `bin` (it uses `process`
// + stdin) and is never imported by the renderer or the React component.
const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));
const NODE_ONLY = new Set(["cli.ts"]);
const browserFiles = readdirSync(srcDir)
  .filter((f) => f.endsWith(".ts") && !NODE_ONLY.has(f));

// Scan CODE, not prose: doc comments legitimately name Buffer/node APIs to
// explain what they replace. Strip block then line comments first. (A `//`
// inside a string — e.g. the SVG xmlns URL — over-strips, but that only risks
// a false NEGATIVE, never a false positive, which is acceptable for a tripwire.)
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("browser-facing core source imports no node: builtins", () => {
  for (const f of browserFiles) {
    assert.doesNotMatch(code(readFileSync(srcDir + f, "utf8")), /from\s+["']node:/, `${f} imports a node: builtin`);
  }
});

test("browser-facing core source uses no require() (ESM only)", () => {
  for (const f of browserFiles) {
    assert.doesNotMatch(code(readFileSync(srcDir + f, "utf8")), /\brequire\s*\(/, `${f} uses require()`);
  }
});

test("browser-facing core source never references Buffer", () => {
  for (const f of browserFiles) {
    assert.doesNotMatch(code(readFileSync(srcDir + f, "utf8")), /\bBuffer\b/, `${f} references Buffer (use bytes.ts helpers)`);
  }
});
