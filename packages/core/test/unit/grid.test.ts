import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseGrid, gridCandidates, gridAspectRatio, assignCellIndices, type Token } from "../../src/entviz.ts";
import { gridShapes } from "../../src/describe.ts";

test("chooseGrid: spec worked example 11 tokens @ 1:1 -> 3x4", () => {
  const g = chooseGrid(11, 1.0);
  assert.deepEqual([g.cols, g.rows], [3, 4]);
});

test("gridCandidates / chooseGrid agree: every candidate is reachable by its own AR", () => {
  // The reshape picker offers gridCandidates; selecting a shape feeds its natural
  // AR back to chooseGrid, which must return exactly that shape.
  for (const count of [6, 11, 16, 20]) {
    for (const c of gridCandidates(count)) {
      const g = chooseGrid(count, gridAspectRatio(c.cols, c.rows));
      assert.deepEqual([g.cols, g.rows], [c.cols, c.rows], `count ${count}, shape ${c.cols}x${c.rows}`);
    }
  }
});

test("gridShapes: distinct arrangements of the value's fixed cell count, tall→wide", () => {
  const shapes = gridShapes("0123456789abcdef".repeat(4)); // a 256-bit hex value
  assert.ok(shapes.length >= 2);
  // sorted ascending by aspect ratio (tall → wide), each targetAr = its own AR
  for (let i = 1; i < shapes.length; i++) assert.ok(shapes[i].targetAr >= shapes[i - 1].targetAr);
  for (const s of shapes) assert.equal(s.targetAr, gridAspectRatio(s.cols, s.rows));
  // arrangements are distinct
  const keys = new Set(shapes.map((s) => `${s.cols}x${s.rows}`));
  assert.equal(keys.size, shapes.length);
});

test("gridShapes: a >512-bit value enumerates shapes of the 20 displayed cells", () => {
  const shapes = gridShapes("0123456789abcdef".repeat(16)); // truncated → 20 tokens
  assert.ok(shapes.length >= 2);
  assert.ok(shapes.every((s) => s.cols * s.rows >= 20));
});

test("chooseGrid: 6 tokens @ 1:1 -> 2x3 (tiles exactly, no blanks)", () => {
  const g = chooseGrid(6, 1.0);
  assert.deepEqual([g.cols, g.rows], [2, 3]);
});

test("chooseGrid: a single token falls back to a 2x2 grid", () => {
  const g = chooseGrid(1, 1.0);
  assert.deepEqual([g.cols, g.rows], [2, 2]);
});

test("chooseGrid: an unreachably-high target AR takes the widest candidate", () => {
  // 11 tokens yields several candidates, all below ar=100, so the 'else' branch
  // reduces over them and picks the widest (max-ar) grid.
  const g = chooseGrid(11, 100);
  assert.ok(g.cols > g.rows); // widest available
  assert.ok(g.cols * g.rows >= 11);
});

const tok = (index: number): Token => ({ text: String(index), index, quant: index });

test("assignCellIndices: identity when tokens fill the grid", () => {
  const tokens = [tok(0), tok(1), tok(2), tok(3)];
  const grid = { cols: 2, rows: 2, tokenCount: 4 };
  const m = assignCellIndices(tokens, grid, tokens[0], tokens);
  assert.deepEqual([...m.entries()].sort(), [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test("assignCellIndices: empty tokens -> empty map", () => {
  const grid = { cols: 2, rows: 2, tokenCount: 0 };
  assert.equal(assignCellIndices([], grid, null, []).size, 0);
});

test("assignCellIndices: equal-text sort keys fall back to the index tie-break", () => {
  // Spare cells make the min/max sort run; equal text forces the index tiebreak.
  const tokens = [tok(0), tok(1), tok(2)];
  const grid = { cols: 3, rows: 2, tokenCount: 3 };
  const sameText: Token[] = [
    { text: "k", index: 0, quant: 0 },
    { text: "k", index: 1, quant: 0 },
    { text: "k", index: 2, quant: 0 },
  ];
  const m = assignCellIndices(tokens, grid, sameText[1], sameText);
  assert.equal(new Set(m.values()).size, 3);
});

test("assignCellIndices: spare cells trigger median + min/max blank shifts", () => {
  // 3 tokens in a 6-cell grid: median shift + both quartile-extreme shifts run,
  // so at least one cell index is pushed past its token's natural position.
  const tokens = [tok(0), tok(1), tok(2)];
  const grid = { cols: 3, rows: 2, tokenCount: 3 };
  const m = assignCellIndices(tokens, grid, tokens[1], tokens);
  assert.equal(m.size, 3);
  const cells = new Set(m.values());
  assert.equal(cells.size, 3); // still injective
  assert.ok(Math.max(...cells) >= 3); // some token shifted into the spare cells
});
