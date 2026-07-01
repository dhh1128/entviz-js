import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReadbackPlan,
  classifyValue,
  startCeremony,
  respond,
  finish,
  coverage,
  type ReadbackPlan,
} from "../../src/live-ceremony.ts";
import { describeChannels } from "../../src/describe.ts";

// Deterministic [0,1) source (LCG) — stands in for the authenticator's live choice.
function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → small, constrained, hex
const HEX512 = "0123456789abcdef".repeat(8); // 512 bits, medium, constrained, hex (clean)
const BIG = "0123456789abcdef".repeat(16); // >512 bits → big (truncated)
const B64URL = "AbCd-EfGh_IjKl-MnOp_QrSt-UvWx_YzAb01"; // native base64url → medium, constrained, prone
const TEXT = "hello world this is arbitrary prose for the ceremony tests"; // txt fallback → programmable, prone

const filled = (value: string): number[] =>
  describeChannels(value, {}).cells.filter((c) => !c.blank).map((c) => c.index);
const fps = (value: string): number[] =>
  describeChannels(value, {}).cells.filter((c) => c.fingerprint).map((c) => c.index);

// --- classifyValue --------------------------------------------------------

test("classifyValue: size classes (small / medium / big)", () => {
  assert.equal(classifyValue(UUID).sizeClass, "small");
  assert.equal(classifyValue(HEX512).sizeClass, "medium");
  assert.equal(classifyValue(BIG).sizeClass, "big");
});

test("classifyValue: constrained vs programmable (the txt fallback is programmable)", () => {
  assert.equal(classifyValue(HEX512).constrained, true);
  assert.equal(classifyValue(UUID).constrained, true);
  assert.equal(classifyValue(TEXT).constrained, false); // arbitrary prose ⇒ txt→b64url
});

test("classifyValue: homoglyph-prone only for base64/base64url alphabets", () => {
  assert.equal(classifyValue(HEX512).homoglyphProne, false); // hex is clean
  assert.equal(classifyValue(BIG).homoglyphProne, false);
  assert.equal(classifyValue(B64URL).homoglyphProne, true);
  assert.equal(classifyValue(TEXT).homoglyphProne, true); // txt→b64url is base64url
});

// --- buildReadbackPlan: voice-only ---------------------------------------

test("voice-only, small: read all cells", () => {
  const p = buildReadbackPlan(UUID, {}, "voice-only", rngFrom(1));
  assert.equal(p.kind, "all-cells");
  assert.deepEqual([...p.cells].sort((a, b) => a - b), filled(UUID));
  assert.equal(p.homoglyphExtra, 0);
});

test("voice-only, medium constrained: read a chosen row or column", () => {
  const p = buildReadbackPlan(HEX512, {}, "voice-only", rngFrom(4));
  assert.equal(p.kind, "row-or-column");
  assert.ok(p.line);
  assert.ok(p.cells.length >= 2);
  // every chosen cell really lies on that line
  const d = describeChannels(HEX512, {});
  for (const ci of p.cells) {
    const c = d.cells[ci];
    assert.equal(p.line!.axis === "row" ? c.row : c.col, p.line!.index);
  }
});

test("voice-only, medium programmable: read all cells (no sound sample)", () => {
  const p = buildReadbackPlan(TEXT, {}, "voice-only", rngFrom(2));
  assert.equal(classifyValue(TEXT).sizeClass, "medium");
  assert.equal(p.kind, "all-cells");
  // an all-cells read needs no homoglyph compensation even on a confusable alphabet
  assert.equal(p.homoglyphExtra, 0);
});

test("voice-only, big: read the fingerprint-middle cells only", () => {
  const p = buildReadbackPlan(BIG, {}, "voice-only", rngFrom(5));
  assert.equal(p.kind, "fingerprint-cells");
  assert.deepEqual([...p.cells].sort((a, b) => a - b), fps(BIG));
  assert.ok(p.cells.length > 0);
  assert.equal(p.homoglyphExtra, 0); // Crockford middle is homoglyph-clean
});

test("voice-only, medium constrained + confusable alphabet: one extra compensation cell", () => {
  const p = buildReadbackPlan(B64URL, {}, "voice-only", rngFrom(7));
  assert.equal(p.kind, "row-or-column");
  assert.equal(p.homoglyphExtra, 1);
  // the extra cell is distinct from the line cells and still a filled cell
  assert.equal(new Set(p.cells).size, p.cells.length);
  for (const ci of p.cells) assert.ok(filled(B64URL).includes(ci));
});

// --- buildReadbackPlan: paste-bind ---------------------------------------

test("paste-bind, constrained non-big: bind on a couple of cells", () => {
  const p = buildReadbackPlan(HEX512, {}, "paste-bind", rngFrom(3));
  assert.equal(p.kind, "bind");
  assert.equal(p.cells.length, 2);
  for (const ci of p.cells) assert.ok(filled(HEX512).includes(ci));
});

test("paste-bind, big: bind on hash-anchored fingerprint cells", () => {
  const p = buildReadbackPlan(BIG, {}, "paste-bind", rngFrom(6));
  assert.equal(p.kind, "bind");
  assert.equal(p.cells.length, 2);
  for (const ci of p.cells) assert.ok(fps(BIG).includes(ci));
});

test("paste-bind, programmable non-big: fall back to reading all cells", () => {
  const p = buildReadbackPlan(TEXT, {}, "paste-bind", rngFrom(8));
  assert.equal(p.kind, "all-cells");
  assert.deepEqual([...p.cells].sort((a, b) => a - b), filled(TEXT));
});

test("paste-bind, constrained + confusable alphabet: bind gets a compensation cell", () => {
  const p = buildReadbackPlan(B64URL, {}, "paste-bind", rngFrom(9));
  assert.equal(p.kind, "bind");
  assert.equal(p.homoglyphExtra, 1);
  assert.equal(p.cells.length, BIND_CELLS_PLUS_EXTRA);
});
const BIND_CELLS_PLUS_EXTRA = 3;

// --- the ceremony reducer -------------------------------------------------

const planAll = (value: string): ReadbackPlan =>
  buildReadbackPlan(value, {}, "voice-only", rngFrom(1));

test("reducer: all matches walk to NO-DIFFERENCE, never IDENTICAL", () => {
  let s = startCeremony(planAll(UUID));
  assert.equal(s.status, "pending");
  while (!s.ended) s = respond(s, "match");
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, true);
});

test("reducer: one differ is a certain, terminal DIFFERENT", () => {
  let s = startCeremony(planAll(UUID));
  s = respond(s, "match");
  s = respond(s, "differ");
  assert.equal(s.status, "different");
  assert.equal(s.ended, true);
  // further responses are inert once ended
  assert.deepEqual(respond(s, "match"), s);
});

test("reducer: coverage climbs 0→1 across the read-back", () => {
  let s = startCeremony(planAll(UUID));
  assert.equal(coverage(s), 0);
  const n = s.plan.cells.length;
  for (let i = 1; i <= n; i++) {
    s = respond(s, "match");
    assert.ok(Math.abs(coverage(s) - i / n) < 1e-9);
  }
  assert.equal(coverage(s), 1);
});

test("reducer: finish before the end freezes PENDING; after the end keeps NO-DIFFERENCE", () => {
  let s = startCeremony(planAll(HEX512));
  s = respond(s, "match"); // partial
  const frozen = finish(s);
  assert.equal(frozen.status, "pending");
  assert.equal(frozen.ended, true);
  assert.deepEqual(finish(frozen), frozen); // idempotent once ended

  let t = startCeremony(planAll(UUID));
  while (!t.ended) t = respond(t, "match");
  assert.equal(finish(t).status, "no-difference"); // already ended → unchanged
});

test("reducer: respond past the end is a no-op", () => {
  let s = startCeremony(planAll(UUID));
  while (!s.ended) s = respond(s, "match");
  assert.deepEqual(respond(s, "match"), s);
});

test("coverage: an empty plan reports 0 and never affirms", () => {
  const empty: ReadbackPlan = {
    mode: "voice-only", kind: "all-cells",
    cls: { sizeClass: "small", constrained: true, homoglyphProne: false, filledCells: 0 },
    cells: [], line: null, homoglyphExtra: 0,
  };
  const s = startCeremony(empty);
  assert.equal(coverage(s), 0);
  assert.equal(finish(s).status, "pending");
});
