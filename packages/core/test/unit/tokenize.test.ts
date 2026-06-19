import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  computeFingerprint,
  fingerprintMiddleDigest,
  tokenizeFingerprint,
  medianToken,
  quartileTokens,
  decodedByteLength,
  HEX,
  BASE64URL,
  type Token,
} from "../../src/entviz.ts";

test("tokenize hex into 24-bit quants (full tokens)", () => {
  const t = tokenize("0123456789abcdef", HEX);
  assert.equal(t.length, 3); // 16 chars / 6-per-token = ceil = 3
  assert.equal(t[0].text, "012345");
  assert.equal(t[0].quant, 0x012345);
  assert.equal(t[0].index, 0);
  assert.equal(t[1].index, 1);
});

test("tokenize extends short tokens by repeating low bits", () => {
  // 2-char hex "ab" -> 8 bits 0xAB -> extend to 24 by repetition -> 0xababab
  assert.equal(tokenize("ab", HEX)[0].quant, 0xababab);
  // 1-char hex "a" -> 4 bits 0xA -> 0xaaaaaa
  assert.equal(tokenize("a", HEX)[0].quant, 0xaaaaaa);
});

test("tokenize maps base64 '+' and '/' to the urlsafe '-' and '_' values", () => {
  // '+' and '-' both decode to 62; '/' and '_' both to 63 — same quant.
  assert.equal(
    tokenize("+/", BASE64URL)[0].quant,
    tokenize("-_", BASE64URL)[0].quant,
  );
});

test("tokenize treats unknown characters as zero", () => {
  assert.equal(tokenize("z", HEX)[0].quant, 0); // 'z' is not hex
  assert.equal(tokenize("$", BASE64URL)[0].quant, 0); // '$' is not base64url
});

test("tokenize of empty string yields no tokens", () => {
  assert.deepEqual(tokenize("", HEX), []);
});

test("computeFingerprint is SHA-512 of the UTF-8 text (64 bytes, deterministic)", () => {
  const a = computeFingerprint("hello");
  assert.equal(a.length, 64);
  assert.deepEqual(a, computeFingerprint("hello"));
  assert.notDeepEqual(a, computeFingerprint("hellp"));
});

test("fingerprintMiddleDigest is domain-separated from the primary fingerprint", () => {
  const second = fingerprintMiddleDigest("hello");
  assert.equal(second.length, 64);
  assert.notDeepEqual(second, computeFingerprint("hello"));
  assert.deepEqual(second, fingerprintMiddleDigest("hello"));
});

test("tokenizeFingerprint yields exactly 22 ftoks", () => {
  const ftoks = tokenizeFingerprint(computeFingerprint("hello"));
  assert.equal(ftoks.length, 22);
});

test("tokenizeFingerprint rejects a non-64-byte digest", () => {
  assert.throws(() => tokenizeFingerprint(Buffer.alloc(10)), /64 bytes/);
});

const tok = (text: string, index: number, quant: number): Token => ({ text, index, quant });

test("medianToken: empty -> null; else the lower-middle by ASCII text", () => {
  assert.equal(medianToken([]), null);
  const toks = [tok("ccc", 0, 0), tok("aaa", 1, 0), tok("bbb", 2, 0)];
  assert.equal(medianToken(toks)!.text, "bbb");
});

test("quartileTokens: empty -> four nulls; else padded to 4 by reverse-sort", () => {
  assert.deepEqual(quartileTokens([]), [null, null, null, null]);
  const q = quartileTokens([tok("ab", 0, 0), tok("cd", 1, 0)]);
  assert.equal(q.length, 4);
  assert.ok(q[0] && q[1]);
  assert.equal(q[2], null); // fewer than 4 tokens -> later quartiles are null
  assert.equal(q[3], null);
});

test("medianToken: equal text falls back to the index tie-break", () => {
  const toks = [tok("aa", 0, 0), tok("aa", 1, 0), tok("aa", 2, 0)];
  assert.equal(medianToken(toks)!.index, 1); // stable lower-middle by index
});

test("quartileTokens: equal reversed text falls back to the index tie-break", () => {
  const q = quartileTokens([tok("ab", 0, 0), tok("ab", 1, 0)]);
  assert.equal(q[0]!.index, 0);
  assert.equal(q[1]!.index, 1);
});

test("decodedByteLength: hex is 4 bits/char, base64url 6 bits/char", () => {
  assert.equal(decodedByteLength("abcdef", HEX), 3); // 6*4/8
  assert.equal(decodedByteLength("abcd", BASE64URL), 3); // 4*6/8
});
