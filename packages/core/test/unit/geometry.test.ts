import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeGeometry,
  cellTextSizes,
  boxOrigin,
  HEX,
  BASE64URL,
} from "../../src/entviz.ts";

const grid = { cols: 2, rows: 2, tokenCount: 4 };

test("computeGeometry: derived pixel dimensions at 12pt/96dpi", () => {
  const g = computeGeometry(12, grid, false);
  assert.equal(g.fs, 16); // 12 * 96 / 72
  assert.equal(g.nucleusWidth, 48);
  assert.equal(g.nucleusHeight, 20);
  assert.equal(g.boxWidth, 6);
  assert.equal(g.boxHeight, 10);
  assert.equal(g.cellWidth, 60);
  assert.equal(g.cellHeight, 40);
  assert.equal(g.gm, 5);
  assert.equal(g.barWidth, 20);
  assert.equal(g.gridW, 120);
  assert.equal(g.gridH, 80);
});

test("computeGeometry: a bottom label strip adds nucleus_height + gm of height", () => {
  const without = computeGeometry(12, grid, false);
  const withBottom = computeGeometry(12, grid, true);
  assert.equal(withBottom.boundingH - without.boundingH, 20); // nucleusHeight
  assert.equal(withBottom.boundingW, without.boundingW); // width unaffected
});

test("cellTextSizes: hex (4-bit) shrinks to 0.75x; base64url (6-bit) stays", () => {
  const hexSizes = cellTextSizes(12, HEX);
  assert.equal(hexSizes.cellTextPx, 12); // round(12*0.75)=9 pt -> 12 px
  const b64Sizes = cellTextSizes(12, BASE64URL);
  assert.equal(b64Sizes.cellTextPx, 16); // 12 pt -> 16 px
  assert.equal(b64Sizes.labelTextPx, 12); // labels always 0.75x
});

test("boxOrigin: each of the four surround edges (top/right/bottom/left)", () => {
  // cellX=0, cellY=0, bw=6, bh=10, nucW=48, nucH=20 => nLeft=6,nTop=10,nRight=54,nBottom=30
  assert.deepEqual(boxOrigin(0, 0, 0, 6, 10, 48, 20), [0, 0]); // top row, i<10
  assert.deepEqual(boxOrigin(10, 0, 0, 6, 10, 48, 20), [54, 10]); // right col, i<12
  assert.deepEqual(boxOrigin(12, 0, 0, 6, 10, 48, 20), [54, 30]); // bottom row, i<22
  assert.deepEqual(boxOrigin(23, 0, 0, 6, 10, 48, 20), [0, 10]); // left col, i>=22
});
