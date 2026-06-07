import { test } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  tokenize,
  HEX,
  computeFingerprint,
  tokenizeFingerprint,
  nucleusColors,
  oklabLightness,
  chooseGrid,
  SPEC_VERSION,
} from "../src/entviz.ts";

test("tokenize hex into 24-bit quants", () => {
  const t = tokenize("0123456789abcdef", HEX);
  assert.equal(t.length, 3); // 16 chars / 6 per token = ceil = 3
  assert.equal(t[0].text, "012345");
  assert.equal(t[0].quant, 0x012345);
});

test("quant extension repeats low bits for short tokens", () => {
  // 4-char hex tail "cdef" -> 16 bits -> extend to 24 by repeating low byte
  const t = tokenize("abcdef" + " cd".replace(" ", ""), HEX);
  // last token is "" guarded; ensure a 2-char remainder extends to 24 bits
  const t2 = tokenize("ab", HEX); // 8 bits 0xAB -> 0xABABAB
  assert.equal(t2[0].quant, 0xababab);
});

test("fingerprint yields exactly 22 ftoks", () => {
  const ftoks = tokenizeFingerprint(computeFingerprint("hello"));
  assert.equal(ftoks.length, 22);
});

test("nucleus colors: CSS RGB order + Oklab fg pick", () => {
  const [bg, fg] = nucleusColors(0x452301); // r=01 g=23 b=45
  assert.equal(bg, "#012345");
  assert.equal(fg, "#ffffff"); // dark -> white text
  assert.ok(oklabLightness(255, 255, 255) > 0.99);
  assert.ok(oklabLightness(0, 0, 0) < 0.01);
});

test("chooseGrid 11 tokens @ 1:1 -> 3x4 (spec worked example)", () => {
  const g = chooseGrid(11, 1.0);
  assert.equal(g.cols, 3);
  assert.equal(g.rows, 4);
});

test("render is deterministic and stamps version", () => {
  const a = render("0123456789abcdef0123456789abcdef");
  const b = render("0123456789abcdef0123456789abcdef");
  assert.equal(a, b);
  assert.match(a, new RegExp(`data-entviz-version="${SPEC_VERSION}"`));
  assert.match(a, /viewBox="0 0 /);
});

test("invalid note and out-of-range font size are rejected", () => {
  assert.throws(() => render("a1b2c3d4", { note: "two words" }));
  assert.throws(() => render("a1b2c3d4", { note: "toolongnote" }));
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 4 }));
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 40 }));
});

test("case/dash invariants collapse to identical SVGs", () => {
  // UUID dashed vs undashed produce identical entvizes (only raw length meta differs)
  const dashed = render("550e8400-e29b-41d4-a716-446655440000");
  const undashed = render("550e8400e29b41d4a716446655440000");
  // strip the data-input-bytes attr (legitimately differs) then compare
  const strip = (s: string) => s.replace(/ data-input-bytes="\d+"/, "");
  assert.equal(strip(dashed), strip(undashed));
});
