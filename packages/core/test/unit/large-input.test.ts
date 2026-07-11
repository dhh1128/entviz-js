import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crockford5,
  fingerprintMiddleTokens,
  fingerprintMiddleDigest,
  tokenizeEntropy,
  tokenize,
  MAX_INPUT_CHARS,
  inputTooLargeMessage,
  HEX,
} from "../../src/entviz.ts";

// >512-bit large-input path (spec "Large-input handling"): head (8 tokens) +
// fingerprint-middle (4 Crockford tokens) + tail (8 tokens), truncated=true.

test("crockford5: 24-bit value → 5 lowercase Crockford base32 chars (excludes i/l/o/u)", () => {
  assert.equal(crockford5(0), "00000");
  assert.equal(crockford5(1), "00001");
  assert.equal(crockford5(31), "0000z"); // 31 → 'Z' (last symbol)
  assert.equal(crockford5(0xffffff), "fzzzz"); // all 24 bits
});

test("fingerprintMiddleTokens: 4 tokens (idx 0..3) reading second-digest 3-byte groups", () => {
  const toks = fingerprintMiddleTokens("hello");
  assert.equal(toks.length, 4);
  const second = fingerprintMiddleDigest("hello");
  for (let i = 0; i < 4; i++) {
    assert.equal(toks[i].index, i);
    const quant = (second[3 * i] << 16) | (second[3 * i + 1] << 8) | second[3 * i + 2];
    assert.equal(toks[i].quant, quant);
    assert.equal(toks[i].text, crockford5(quant));
    assert.equal(toks[i].text.length, 5);
    assert.match(toks[i].text, /^[0-9a-hjkmnp-tv-z]{5}$/); // Crockford lowercase
  }
});

test("tokenizeEntropy: ≤512-bit input takes the short path (truncated=false)", () => {
  const { tokens, truncated } = tokenizeEntropy("0123456789abcdef", HEX);
  assert.equal(truncated, false);
  assert.deepEqual(tokens, tokenize("0123456789abcdef", HEX)); // unchanged
});

test("tokenizeEntropy: >512-bit input → 20 tokens (head+middle+tail), truncated=true", () => {
  const big = "0123456789abcdef".repeat(16); // 256 hex chars = 1024 bits
  const { tokens, truncated } = tokenizeEntropy(big, HEX);
  assert.equal(truncated, true);
  assert.equal(tokens.length, 20);
  tokens.forEach((t, i) => assert.equal(t.index, i)); // renumbered 0..19
  // head = first 8 tokens of the input (48 chars), tail = last 8 tokens.
  assert.deepEqual(tokens.slice(0, 8).map((t) => t.text), tokenize(big.slice(0, 48), HEX).map((t) => t.text));
  assert.deepEqual(tokens.slice(12).map((t) => t.text), tokenize(big.slice(-48), HEX).map((t) => t.text));
  // middle = the 4 Crockford fingerprint tokens.
  assert.deepEqual(tokens.slice(8, 12).map((t) => t.text), fingerprintMiddleTokens(big).map((t) => t.text));
});

test("tokenizeEntropy: >512-bit triggers via byte length even at ≤22 tokens", () => {
  // 130 hex chars = 65 bytes (>64) but ceil(130/6)=22 tokens (≤22): the byte
  // operand of the short-path guard must still route to the large path.
  const { truncated } = tokenizeEntropy("a".repeat(130), HEX);
  assert.equal(truncated, true);
});

test("MAX_INPUT_CHARS is the 64 KiB anti-DoS cap", () => {
  assert.equal(MAX_INPUT_CHARS, 65536);
});

test("inputTooLargeMessage: a complete sentence stating the length and the cap", () => {
  assert.equal(
    inputTooLargeMessage(70000),
    `The input is too large: it has 70000 characters, but the maximum is ${MAX_INPUT_CHARS}.`,
  );
});
