import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCorner,
  CORNER_TOKENS,
  DEFAULT_CORNER,
  DEFAULT_CORNER_MAP,
  type CornerMap,
} from "../../src/corners.ts";

// gk37dm5n (this.i): corner shape encodes the closed `role` enum, NOT the value —
// so it carries no identity bits and needs no trust gate. `resolveCorner` is the
// pure lookup: role (null normalized to "raw") + a host CornerMap -> a curated
// CornerToken. It must be total (always returns a token) so the pill never has an
// undefined corner. Vocabulary chosen for distinctiveness: round / sharp / leaf /
// bevel (the last two are the round vs. angular diagonal pair).

test("resolves an explicit role entry", () => {
  const map: CornerMap = { digest: "sharp", signature: "bevel", default: "round" };
  assert.equal(resolveCorner("digest", map), "sharp");
  assert.equal(resolveCorner("signature", map), "bevel");
});

test("null role is normalized to the \"raw\" bucket", () => {
  const map: CornerMap = { raw: "leaf", default: "round" };
  assert.equal(resolveCorner(null, map), "leaf");
});

test("an unmatched role falls through to `default`", () => {
  const map: CornerMap = { digest: "sharp", default: "leaf" };
  assert.equal(resolveCorner("address", map), "leaf");
  assert.equal(resolveCorner("identifier", map), "leaf");
});

test("null role with no \"raw\" entry falls through to `default`", () => {
  const map: CornerMap = { digest: "sharp", default: "leaf" };
  assert.equal(resolveCorner(null, map), "leaf");
});

test("with no `default` and no match, returns the built-in DEFAULT_CORNER", () => {
  assert.equal(resolveCorner("key", {}), DEFAULT_CORNER);
  assert.equal(resolveCorner(null, {}), DEFAULT_CORNER);
});

test("an explicit role entry wins over the raw/default fallbacks", () => {
  const map: CornerMap = { key: "sharp", raw: "leaf", default: "round" };
  assert.equal(resolveCorner("key", map), "sharp");
});

test("every mappable key resolves to a token in the curated vocabulary", () => {
  const map: CornerMap = {
    key: "round",
    signature: "bevel",
    digest: "sharp",
    address: "leaf",
    identifier: "round",
    raw: "round",
  };
  for (const role of ["key", "signature", "digest", "address", "identifier"] as const) {
    assert.ok(CORNER_TOKENS.includes(resolveCorner(role, map)));
  }
  assert.ok(CORNER_TOKENS.includes(resolveCorner(null, map)));
});

test("DEFAULT_CORNER is itself a member of the curated vocabulary", () => {
  assert.ok(CORNER_TOKENS.includes(DEFAULT_CORNER));
});

test("DEFAULT_CORNER_MAP is a bijection: all 5 roles + raw get distinct shapes", () => {
  // Every category — the five roles plus the null-role "raw" bucket — must resolve
  // to a DIFFERENT token so a scanner can tell them all apart at a glance.
  const shapes = [
    resolveCorner("key", DEFAULT_CORNER_MAP),
    resolveCorner("signature", DEFAULT_CORNER_MAP),
    resolveCorner("digest", DEFAULT_CORNER_MAP),
    resolveCorner("address", DEFAULT_CORNER_MAP),
    resolveCorner("identifier", DEFAULT_CORNER_MAP),
    resolveCorner(null, DEFAULT_CORNER_MAP), // raw
  ];
  assert.equal(new Set(shapes).size, 6); // all distinct
  assert.equal(new Set(shapes).size, CORNER_TOKENS.length); // …and covers the vocabulary
  for (const s of shapes) assert.ok(CORNER_TOKENS.includes(s));
  // every value in the map is a valid token
  for (const v of Object.values(DEFAULT_CORNER_MAP)) assert.ok(CORNER_TOKENS.includes(v!));
});
