import { test } from "node:test";
import assert from "node:assert/strict";
import { render, MAX_INPUT_CHARS } from "../../src/entviz.ts";

const BIG_HEX = "0123456789abcdef".repeat(16); // 256 hex chars = 1024 bits

test("render: a >512-bit input no longer throws; it takes the large-input path", () => {
  const svg = render(BIG_HEX);
  assert.match(svg, /<svg/);
  assert.match(svg, /data-truncated="true"/);
});

test("render: large input shows the loud '+hash' marker + byte-length type", () => {
  const svg = render(BIG_HEX);
  assert.match(svg, /\+hash /);
  // v15: the top label is the projected characterization; a >512-bit hex input
  // reads "+hash hex, <bits>-bit" (256 hex chars = 1024 bits decoded).
  assert.match(svg, /hex, 1024-bit/);
  assert.match(svg, /fill="#a00000"/); // bold dark-red marker
});

test("render: exactly 4 fingerprint-middle cells, flagged + Crockford readout", () => {
  const svg = render(BIG_HEX);
  const flags = svg.match(/data-cell-fingerprint="true"/g) ?? [];
  assert.equal(flags.length, 4);
});

test("render: a short input is NOT truncated (data-truncated omitted)", () => {
  const svg = render("0123456789abcdef0123456789abcdef");
  assert.doesNotMatch(svg, /data-truncated/);
  assert.doesNotMatch(svg, /\+hash/);
});

test("render: 512-bit input (boundary) stays the lossless short path", () => {
  const svg = render("ab".repeat(64)); // 128 hex chars = 512 bits, exactly
  assert.doesNotMatch(svg, /data-truncated/);
});

test("render: input past the anti-DoS cap is rejected", () => {
  assert.throws(
    () => render("a".repeat(MAX_INPUT_CHARS + 1)),
    new RegExp(`The input is too large: it has ${MAX_INPUT_CHARS + 1} characters, but the maximum is ${MAX_INPUT_CHARS}\\.`),
  );
});

test("render: a large UTF-8 fallback input also renders (truncated)", () => {
  const svg = render("The quick brown fox ".repeat(20)); // 400 chars -> base64url core
  assert.match(svg, /data-truncated="true"/);
});
