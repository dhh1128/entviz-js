import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, keccak256Hex } from "../../src/keccak.ts";

// Known-answer vectors, cross-checked against the Python reference
// (src/entviz/keccak.py) and the Rust port (src/keccak.rs). These pin the
// ORIGINAL Keccak (0x01..0x80 padding), NOT NIST SHA3-256.
test("keccak256: empty string", () => {
  assert.equal(
    keccak256Hex(Buffer.from("", "ascii")),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
});

test("keccak256: 'abc'", () => {
  assert.equal(
    keccak256Hex(Buffer.from("abc", "ascii")),
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
});

test("keccak256: EIP-55 body vector", () => {
  assert.equal(
    keccak256Hex(Buffer.from("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed", "ascii")),
    "d385650ce8fdc6db7ee3a091d34814dbc4ce18219ffae52182efff4034d707e5",
  );
});

test("keccak256: multi-block absorb (200 bytes > 136-byte rate)", () => {
  assert.equal(
    keccak256Hex(Buffer.alloc(200, "a".charCodeAt(0))),
    "96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d",
  );
});

test("keccak256: non-multiple-of-rate multi-block (215 bytes)", () => {
  const phrase = "The quick brown fox jumps over the lazy dog";
  const data = Buffer.alloc(215);
  for (let i = 0; i < 215; i++) data[i] = phrase.charCodeAt(i % phrase.length);
  assert.equal(
    keccak256Hex(data),
    "2bca465790fbe952f1e3768e10357fe439df1a1253d3dbfaf2a2a583911c68d8",
  );
});

test("keccak256: digest is 32 bytes and hex agrees with the byte digest", () => {
  const d = keccak256(Buffer.from("entviz", "ascii"));
  assert.equal(d.length, 32);
  assert.equal(keccak256Hex(Buffer.from("entviz", "ascii")), d.toString("hex"));
});
