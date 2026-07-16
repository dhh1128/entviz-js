import { test } from "node:test";
import assert from "node:assert/strict";
import { CORNER_TOKENS } from "../../src/entviz.ts";

// gk37dm5n (this.i): corners are an explicit, optional pill style (`corner` prop) — no
// longer derived from the value's type (the role icon carries that). The vocabulary is a
// small curated set of border-radius treatments.

test("the corner vocabulary is the three explicit treatments", () => {
  assert.deepEqual([...CORNER_TOKENS], ["round", "sharp", "leaf"]);
});
