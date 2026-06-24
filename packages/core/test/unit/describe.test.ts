import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonText, describeChannels } from "../../src/describe.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const HEX_BLANKS = "012345"; // 1 token in a 2x2 grid → 3 blank cells
const HEX_FULL = "012345678901234567890123"; // 4 tokens in a 2x2 grid → 0 blanks
const HEX_1024 = "0123456789abcdef".repeat(16); // >512 bits → truncated path
const LEI = "5493001KJTIIGC8Y1R12"; // LEI → non-null suffix (the check digits)

// --- comparisonText -------------------------------------------------------

test("comparisonText: UUID cells in reading order, space-separated, case-exact", () => {
  // 2x3 grid fully packed (no blanks) → no separators.
  assert.equal(comparisonText(UUID), "550e84 00e29b 41d4a7 164466 554400 00");
});

test("comparisonText: blank cells are preserved as a · separator", () => {
  const text = comparisonText(HEX_BLANKS);
  const parts = text.split(" ");
  assert.equal(parts.length, 4); // 2x2 grid → 4 cells
  assert.equal(parts.filter((p) => p === "·").length, 3); // 3 blanks
  assert.equal(parts.filter((p) => p === "012345").length, 1); // 1 token
});

test("comparisonText: a fully-packed grid has no separators", () => {
  assert.ok(!comparisonText(HEX_FULL).includes("·"));
});

test("comparisonText: a >512-bit input keeps head, Crockford middle, tail with · gaps", () => {
  const text = comparisonText(HEX_1024);
  assert.ok(text.includes("·"), "blank separators preserved");
  assert.ok(text.startsWith("·") || text.includes("012345"), "head tokens present");
  // 4x6 grid → 24 cells → 24 space-separated slots.
  assert.equal(text.split(" ").length, 24);
});

test("comparisonText: deterministic", () => {
  assert.equal(comparisonText(UUID), comparisonText(UUID));
  assert.equal(comparisonText(HEX_1024), comparisonText(HEX_1024));
});

// --- describeChannels -----------------------------------------------------

test("describeChannels: UUID structure (type, grid, letters, bar slots, no blank map)", () => {
  const d = describeChannels(UUID);
  assert.equal(d.typeName, "UUID");
  assert.equal(d.truncated, false);
  assert.equal(d.cols, 2);
  assert.equal(d.rows, 3);
  assert.equal(d.cells.length, 6);
  assert.deepEqual(d.colorBarLetters, ["g", "r", "b", "k"]);
  assert.equal(d.markers.colorBar.slots, 12);
  assert.ok(d.markers.colorBar.left >= 0 && d.markers.colorBar.left < 12);
  assert.ok(d.markers.colorBar.right >= 0 && d.markers.colorBar.right < 12);
  assert.equal(d.markers.blankMap, null); // 2x3 packed → no blank cells
  assert.ok(d.cells.every((c) => !c.blank && !c.fingerprint && typeof c.text === "string"));
});

test("describeChannels: quartile marks name their cells (and null when a ftok is absent)", () => {
  const d = describeChannels(UUID);
  assert.deepEqual(
    d.quartiles.map((q) => q.rank),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    d.quartiles.map((q) => q.orientation),
    ["top-left", "top-right", "bottom-right", "bottom-left"],
  );
  // UUID has 5 distinct ftoks → the 4th quartile is null on this short input.
  assert.ok(d.quartiles.some((q) => q.cellIndex === null));
  assert.ok(d.quartiles.some((q) => q.cellIndex !== null));
});

test("describeChannels: blank cells produce a blank-map with min/max cells", () => {
  const d = describeChannels(HEX_BLANKS);
  assert.ok(d.cells.some((c) => c.blank && c.text === null));
  assert.notEqual(d.markers.blankMap, null);
  assert.equal(typeof d.markers.blankMap?.minCell, "number");
  assert.equal(typeof d.markers.blankMap?.maxCell, "number");
});

test("describeChannels: >512-bit input is truncated with exactly 4 fingerprint cells", () => {
  const d = describeChannels(HEX_1024);
  assert.equal(d.truncated, true);
  assert.equal(d.cols, 4);
  assert.equal(d.rows, 6);
  assert.equal(d.cells.filter((c) => c.fingerprint).length, 4);
  // fingerprint cells carry text (the Crockford readout), not blanks.
  assert.ok(d.cells.filter((c) => c.fingerprint).every((c) => c.text !== null && !c.blank));
});

test("describeChannels: a value with a suffix (LEI) still builds (suffix → bottom strip)", () => {
  const d = describeChannels(LEI);
  assert.equal(d.typeName, "LEI");
  assert.ok(d.markers.colorBar.slots >= 4);
});

test("describeChannels: a note adds a bottom strip without throwing", () => {
  const d = describeChannels(UUID, { note: "git" });
  assert.equal(d.typeName, "UUID");
  assert.ok(d.markers.colorBar.slots >= 4 && d.markers.colorBar.slots <= 16);
});

test("describeChannels: targetAr changes the grid shape", () => {
  const wide = describeChannels(HEX_1024, { targetAr: 3.0 });
  const square = describeChannels(HEX_1024, { targetAr: 1.0 });
  assert.equal(wide.cells.length, square.cells.length); // same token cap
  assert.notDeepEqual([wide.cols, wide.rows], [square.cols, square.rows]);
});

test("describeChannels: deterministic", () => {
  assert.deepEqual(describeChannels(UUID), describeChannels(UUID));
});
