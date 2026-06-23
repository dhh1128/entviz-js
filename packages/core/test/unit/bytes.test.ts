import { test } from "node:test";
import assert from "node:assert/strict";
import {
  utf8Bytes,
  utf8ByteLength,
  exceedsUtf8ByteCap,
  bytesToHex,
  bytesToBase64url,
} from "../../src/bytes.ts";

// The isomorphic replacements for the Buffer encodings the renderer used to
// lean on. Expected values are Node's Buffer output (the prior ground truth),
// so the swap is provably byte-identical.

test("utf8Bytes encodes to UTF-8 (multibyte aware)", () => {
  assert.deepEqual(utf8Bytes(""), new Uint8Array([]));
  assert.deepEqual(utf8Bytes("abc"), new Uint8Array([0x61, 0x62, 0x63]));
  // 'é' is two UTF-8 bytes (0xc3 0xa9).
  assert.deepEqual(utf8Bytes("é"), new Uint8Array([0xc3, 0xa9]));
});

test("utf8ByteLength counts UTF-8 bytes, not code units", () => {
  assert.equal(utf8ByteLength(""), 0);
  assert.equal(utf8ByteLength("hello"), 5);
  assert.equal(utf8ByteLength("ééé"), 6); // 3 code units, 6 bytes
});

test("exceedsUtf8ByteCap: long ASCII trips the cheap code-unit short-circuit", () => {
  // 65 ASCII chars exceeds a 64-byte cap via the code-unit fast path (no encode).
  assert.equal(exceedsUtf8ByteCap("a".repeat(65), 64), true);
});

test("exceedsUtf8ByteCap: multibyte under the code-unit count still trips on bytes", () => {
  // 33 'é' = 33 code units (<= 64) but 66 UTF-8 bytes (> 64): must reject.
  assert.equal(exceedsUtf8ByteCap("é".repeat(33), 64), true);
});

test("exceedsUtf8ByteCap: within the cap returns false (both operands false)", () => {
  assert.equal(exceedsUtf8ByteCap("a".repeat(64), 64), false);
  assert.equal(exceedsUtf8ByteCap("", 64), false);
});

test("bytesToHex matches Buffer.toString('hex')", () => {
  assert.equal(bytesToHex(new Uint8Array([])), "");
  assert.equal(bytesToHex(new Uint8Array([0x00, 0x01, 0xff])), "0001ff");
});

test("bytesToBase64url matches Buffer.toString('base64url'), all remainders", () => {
  assert.equal(bytesToBase64url(new Uint8Array([])), "");
  assert.equal(bytesToBase64url(new Uint8Array([0x4d])), "TQ"); // rem 1
  assert.equal(bytesToBase64url(new Uint8Array([0x4d, 0x61])), "TWE"); // rem 2
  assert.equal(bytesToBase64url(new Uint8Array([0x4d, 0x61, 0x6e])), "TWFu"); // rem 0
});

test("bytesToBase64url uses the urlsafe alphabet (- and _, no padding)", () => {
  assert.equal(bytesToBase64url(new Uint8Array([251, 255, 191])), "-_-_");
  // Round-trips a known text core (the txt-fallback path).
  assert.equal(bytesToBase64url(utf8Bytes("hi there")), "aGkgdGhlcmU");
});
