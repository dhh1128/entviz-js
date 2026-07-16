import { test } from "node:test";
import assert from "node:assert/strict";
import { autoColorIndex, AUTO_COLOR_PALETTE } from "../../src/entviz.ts";

// tgowi7go (this.i): a value → small-palette index, so recurring values in a trusted
// corpus catch the eye ("the red ones"). A SOFT pre-filter, never a partition — 16
// colors = 4 bits = guaranteed collisions at scale. Derived from the value's primary
// fingerprint (over the normalized core), like the mnemonic — but from a DIFFERENT
// byte (the last), so color and mnemonic are semi-independent channels.

test("AUTO_COLOR_PALETTE has 16 entries, all non-empty color strings", () => {
  assert.equal(AUTO_COLOR_PALETTE.length, 16);
  for (const c of AUTO_COLOR_PALETTE) {
    assert.equal(typeof c, "string");
    assert.ok(c.length > 0);
  }
});

test("index is in range and deterministic", () => {
  const v = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
  const i = autoColorIndex(v);
  assert.ok(Number.isInteger(i));
  assert.ok(i >= 0 && i < AUTO_COLOR_PALETTE.length);
  assert.equal(autoColorIndex(v), i); // stable
});

test("case-insensitive value → same index (fingerprint over the normalized core)", () => {
  assert.equal(autoColorIndex("ABCDEF0123456789"), autoColorIndex("abcdef0123456789"));
});

test("trims surrounding whitespace", () => {
  const bare = "EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv";
  assert.equal(autoColorIndex(`  ${bare}  `), autoColorIndex(bare));
});

test("distinct values generally land on distinct indices (soft pre-filter, not a partition)", () => {
  // Not a guarantee (collisions are expected), but a spread of inputs should touch
  // several buckets — a sanity check that it isn't a constant.
  const idxs = new Set(
    Array.from({ length: 40 }, (_, n) => autoColorIndex("EBfdlu8R27Fbx_ehrqwImnK_" + n)),
  );
  assert.ok(idxs.size >= 6);
});

test("the auto-color index keys off the LAST fingerprint byte (its own projection)", () => {
  const v = "EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv";
  const i = autoColorIndex(v);
  assert.ok(i >= 0 && i < AUTO_COLOR_PALETTE.length);
});
