import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, LIB_VERSION } from "../../src/entviz.ts";
import pkg from "../../package.json" with { type: "json" };

// data-entviz-lib changes legitimately on every release; strip it so the golden
// fixtures gate the VISUAL output, not the version stamp (which has its own
// drift-guard test below).
const stripLib = (svg: string) => svg.replace(/ data-entviz-lib="[^"]*"/, "");

const GOLDEN: Record<string, string> = {
  hex32: "0123456789abcdef0123456789abcdef",
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  txt: "The quick brown fox jumps over the lazy dog",
};

// TST-F2: committed golden SVGs catch ANY byte-level rendering regression
// independently of the cross-repo conformance corpus. Regenerate the fixtures
// (scripts/regen-golden, or by hand) only when a rendering change is intended.
for (const [name, input] of Object.entries(GOLDEN)) {
  test(`golden: ${name} renders byte-identically to the committed fixture`, () => {
    const golden = readFileSync(new URL(`../fixtures/golden/${name}.svg`, import.meta.url), "utf8");
    assert.equal(stripLib(render(input)), stripLib(golden));
  });
}

// TST-F5: determinism must hold across alphabets and input shapes, not just one
// hex string. A non-determinism regression on any path (UUID, fallback text,
// notes, non-default geometry) is caught here.
const DETERMINISM_CASES: [string, Parameters<typeof render>[1]?][] = [
  ["0123456789abcdef0123456789abcdef", undefined], // hex
  ["550e8400-e29b-41d4-a716-446655440000", undefined], // UUID
  ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", undefined], // ETH (EIP-55)
  ["The quick brown fox jumps over the lazy dog", undefined], // txt -> base64url
  ["a1b2c3d4", { note: "git" }], // with a user note
  ["a1b2c3d4", { fontSizePt: 18, targetAr: 2.0 }], // non-default geometry
];
for (const [input, opts] of DETERMINISM_CASES) {
  test(`determinism: ${JSON.stringify(input).slice(0, 24)} renders identically twice`, () => {
    assert.equal(render(input, opts), render(input, opts));
  });
}

// MNT-F1: the data-entviz-lib stamp must equal the published package version,
// and LIB_VERSION must be read from package.json (not a stale literal). This
// fails the instant release.py bumps package.json but the stamp lags.
test("version stamp: data-entviz-lib equals package.json version", () => {
  assert.equal(LIB_VERSION, pkg.version);
  const svg = render("0123456789abcdef0123456789abcdef");
  assert.match(svg, new RegExp(`data-entviz-lib="${pkg.version.replace(/\./g, "\\.")}"`));
});
