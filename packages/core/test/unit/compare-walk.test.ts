import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckPlan,
  startWalk,
  respond,
  coverage,
  type CheckPlan,
} from "../../src/compare-walk.ts";
import { describeChannels } from "../../src/describe.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → "small"
const HEX512 = "0123456789abcdef".repeat(8); // 512 bits, ~22 cells, ≤512 → "large"
const BIG = "0123456789abcdef".repeat(16); // >512 bits → "huge" (truncated)

// Deterministic [0,1) source (LCG) so plans are reproducible in tests.
function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const kinds = (p: CheckPlan) => p.steps.map((s) => s.kind);

// --- buildCheckPlan -------------------------------------------------------

test("buildCheckPlan: quick is a small sub-floor peek that can't go affirmative", () => {
  const p = buildCheckPlan(HEX512, {}, "quick", rngFrom(1));
  assert.equal(p.affirmative, false);
  assert.equal(p.hasProbe, false);
  assert.ok(p.steps.length <= 2);
  assert.ok(kinds(p).includes("text"));
});

test("buildCheckPlan: good mixes text (≥2 backstop) and gestalt, no probe", () => {
  const p = buildCheckPlan(HEX512, {}, "good", rngFrom(2));
  assert.equal(p.affirmative, true);
  assert.equal(p.hasProbe, false);
  assert.ok(kinds(p).filter((k) => k === "text").length >= 2);
  assert.ok(kinds(p).includes("gestalt"));
});

test("buildCheckPlan: complete on a small value reads all text, no gestalt, no probe", () => {
  const p = buildCheckPlan(UUID, {}, "complete", rngFrom(3));
  assert.equal(p.sizeClass, "small");
  assert.equal(p.hasProbe, false);
  assert.ok(p.steps.every((s) => s.kind === "text"));
  assert.equal(p.steps.length, 6); // every filled cell
});

test("buildCheckPlan: complete on a large value adds the gestalt CRC and one probe", () => {
  const p = buildCheckPlan(HEX512, {}, "complete", rngFrom(4));
  assert.equal(p.sizeClass, "large");
  assert.equal(p.hasProbe, true);
  assert.equal(kinds(p).filter((k) => k === "probe").length, 1);
  assert.ok(kinds(p).includes("gestalt"));
});

test("buildCheckPlan: a >512-bit value is huge; good anchors on the fingerprint-middle cells", () => {
  const fp = new Set(describeChannels(BIG).cells.filter((c) => c.fingerprint).map((c) => c.index));
  assert.equal(fp.size, 4);
  const p = buildCheckPlan(BIG, {}, "good", rngFrom(5));
  assert.equal(p.sizeClass, "huge");
  // every credited text cell must be one of the 4 fingerprint-middle cells
  for (const s of p.steps) if (s.kind === "text") assert.ok(fp.has(s.cellIndex));
  // complete-huge has the probe (20 displayed cells > threshold)
  assert.equal(buildCheckPlan(BIG, {}, "complete", rngFrom(6)).hasProbe, true);
});

test("buildCheckPlan: deterministic for a fixed rng", () => {
  assert.deepEqual(
    buildCheckPlan(HEX512, {}, "complete", rngFrom(9)),
    buildCheckPlan(HEX512, {}, "complete", rngFrom(9)),
  );
});

// --- the walk reducer -----------------------------------------------------

const planOf = (steps: CheckPlan["steps"], over: Partial<CheckPlan> = {}): CheckPlan => ({
  preset: "complete",
  steps,
  affirmative: true,
  hasProbe: false,
  sizeClass: "large",
  ...over,
});

test("respond: all-match through an affirmative plan → no-difference", () => {
  let s = startWalk(planOf([
    { kind: "text", cellIndex: 0 },
    { kind: "gestalt", dimension: "ellipse" },
  ]));
  assert.equal(s.status, "pending");
  assert.equal(coverage(s), 0);
  s = respond(s, "match");
  s = respond(s, "match");
  assert.equal(s.status, "no-difference");
  assert.equal(coverage(s), 1);
});

test("respond: a quick plan completes but stays PENDING (a peek, not a verdict)", () => {
  let s = startWalk(planOf([{ kind: "text", cellIndex: 0 }], { preset: "quick", affirmative: false }));
  s = respond(s, "match");
  assert.equal(s.status, "pending");
  // further responses past the end are inert
  assert.deepEqual(respond(s, "match"), s);
});

test("respond: any differs → different (terminal)", () => {
  let s = startWalk(planOf([{ kind: "text", cellIndex: 0 }, { kind: "text", cellIndex: 1 }]));
  s = respond(s, "differ");
  assert.equal(s.status, "different");
  assert.deepEqual(respond(s, "match"), s); // terminal: no further change
});

test("respond: the transparent probe — caught → advance; missed → reset; missed twice → inconclusive", () => {
  const plan = planOf([{ kind: "text", cellIndex: 0 }, { kind: "probe" }, { kind: "gestalt", dimension: "ellipse" }], { hasProbe: true });
  // caught
  let s = startWalk(plan);
  s = respond(s, "match"); // text
  s = respond(s, "differ"); // probe caught
  s = respond(s, "match"); // gestalt
  assert.equal(s.status, "no-difference");
  // missed once → reset to the start
  s = respond(startWalk(plan), "match"); // text, at index 1 (the probe)
  s = respond(s, "match"); // probe missed
  assert.equal(s.index, 0);
  assert.equal(s.probeResets, 1);
  assert.equal(s.status, "pending");
  // missed twice → inconclusive
  s = respond(s, "match"); // text again
  s = respond(s, "match"); // probe missed again
  assert.equal(s.status, "inconclusive");
});
