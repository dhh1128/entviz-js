import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, LIB_VERSION } from "../../src/entviz.ts";
import { GOLDEN_INPUTS } from "../fixtures/golden/inputs.ts";
import pkg from "../../package.json" with { type: "json" };

// data-entviz-lib changes legitimately on every release; strip it so the golden
// fixtures gate the VISUAL output, not the version stamp (which has its own
// drift-guard test below).
const stripLib = (svg: string) => svg.replace(/ data-entviz-lib="[^"]*"/, "");

// The fixture inputs live beside the fixtures themselves so that this test and
// scripts/regen-golden read the same map and cannot drift apart.
const GOLDEN = GOLDEN_INPUTS;

// TST-F2: committed golden SVGs catch ANY byte-level rendering regression
// independently of the cross-repo conformance corpus. Regenerate the fixtures
// with `scripts/regen-golden` (`--check` to diff without writing) only when a
// rendering change is intended.
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

// v16 (this.i:hrpb1nd): two values sharing a bech32 data payload under DIFFERENT
// human-readable parts must render differently. Through v15 the HRP was
// validated by the polymod and then dropped — it entered neither the cells nor
// the fingerprint — so each pair below was byte-identical in every channel a
// human compares (cells, surround, nucleus, edge colours, ellipse, colour bar,
// blank map, quartile marks), differing only in the 12px grey label. The nostr
// pair is the case that forced the issue: a public key and its secret key.
const HRP_SIBLINGS: [string, string, string][] = [
  ["cosmos/osmo (generic bech32)",
    "cosmos1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnrk363e",
    "osmo1qqqsyqcyq5rqwzqfpg9scrgwpugpzysntdz28t"],
  ["bc1/tb1 (segwit mainnet vs testnet)",
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"],
  ["addr1/addr_test1 (Cardano Shelley)",
    "addr1qyqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xmyv4nxw6rfdf4kcmtwdac8zunnw36hvamc09a8klra0elsr0jfpr",
    "addr_test1qyqqzqsrqszsvpcgpy9qkrqdpc83qygjzv2p29shrqv35xmyv4nxw6rfdf4kcmtwdac8zunnw36hvamc09a8klra0els30xwlp"],
  ["npub/nsec (nostr public vs secret key)",
    "npub1802mpadp48s09v7y6hn0wzqe9ga5chtw07qfz23mf3wkuluqjy3swt0n8f",
    "nsec1802mpadp48s09v7y6hn0wzqe9ga5chtw07qfz23mf3wkuluqjy3szayjpu"],
];
for (const [name, a, b] of HRP_SIBLINGS) {
  test(`v16 HRP binds: ${name} render differently`, () => {
    assert.notEqual(render(a), render(b));
    // Not merely a different label: the GRID channel itself must differ (the
    // surround field the fingerprint drives), so the divergence is visible to a
    // reader who never looks at the 12px label strip.
    const grid = (svg: string) =>
      svg.slice(svg.indexOf('data-channel="grid"'), svg.indexOf('data-channel="ellipse"'));
    assert.notEqual(grid(render(a)), grid(render(b)));
  });
}

// MNT-F1: the data-entviz-lib stamp must equal the published package version,
// and LIB_VERSION must be read from package.json (not a stale literal). This
// fails the instant release.py bumps package.json but the stamp lags.
test("version stamp: data-entviz-lib equals package.json version", () => {
  assert.equal(LIB_VERSION, pkg.version);
  const svg = render("0123456789abcdef0123456789abcdef");
  // Plain substring check (no RegExp built from a version string).
  assert.ok(svg.includes(`data-entviz-lib="${pkg.version}"`));
});
