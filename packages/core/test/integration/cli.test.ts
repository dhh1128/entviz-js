import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// TST-F1: the conformance CLI (the --impl-cmd target for every conformance run)
// was untested. Drive it as a real subprocess and assert the stdin/JSON
// contract, the param defaults, exit codes, and the error path.
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));

function runCli(input: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI], { input, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("cli: a render vector writes an SVG to stdout and exits 0", () => {
  const r = runCli(
    JSON.stringify({
      entropy: "deadbeefdeadbeefdeadbeefdeadbeef",
      params: { target_ar: 1.0, font_size_pt: 12, note: null },
    }),
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^<svg/);
  assert.match(r.stdout, /data-entviz-version="v15"/);
  // v13: the structured characterization is emitted on the root <svg> (a
  // deadbeef… 32-hex string is recognized as an undashed UUID).
  assert.match(r.stdout, /data-scheme="uuid"/);
  assert.match(r.stdout, /data-size-basis="decoded"/);
});

test("cli: params default when omitted (target_ar=1, font_size_pt=12, note=null)", () => {
  const r = runCli(JSON.stringify({ entropy: "deadbeefdeadbeefdeadbeefdeadbeef" }));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^<svg/);
});

test("cli: an invalid note is rejected with a non-zero exit and a message", () => {
  const r = runCli(
    JSON.stringify({ entropy: "a1b2c3d4", params: { note: "toolongnote" } }),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note/i);
  assert.equal(r.stdout, "");
});

test("cli: a bad-EIP-55 address is rejected (exit 1) — the err-eip55 contract", () => {
  const r = runCli(
    JSON.stringify({ entropy: "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed" }),
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /EIP-55/);
});
