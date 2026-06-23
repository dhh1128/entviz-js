import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8Bytes, bytesToHex } from "../../src/bytes.ts";

// EIP-55 checksums use the ORIGINAL Keccak-256 (0x01..0x80 padding), NOT NIST
// SHA3-256 (0x06..0x80) — a distinction node's createHash("sha3-256") gets
// wrong, which is why this port relies on @noble/hashes' keccak_256. These
// known-answer vectors (cross-checked against the Python/Rust references) pin
// that we are using the Ethereum variant; if a noble upgrade ever changed the
// padding, the EIP-55 path would silently re-key and these would fail first.
const kat = (s: string) => bytesToHex(keccak_256(utf8Bytes(s)));

test("keccak_256: empty string (Ethereum variant)", () => {
  assert.equal(
    kat(""),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
});

test("keccak_256: 'abc'", () => {
  assert.equal(
    kat("abc"),
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
});

test("keccak_256: EIP-55 body vector", () => {
  assert.equal(
    kat("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"),
    "d385650ce8fdc6db7ee3a091d34814dbc4ce18219ffae52182efff4034d707e5",
  );
});

test("keccak_256: multi-block absorb (200 bytes > 136-byte rate)", () => {
  assert.equal(
    bytesToHex(keccak_256(new Uint8Array(200).fill("a".charCodeAt(0)))),
    "96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d",
  );
});

test("keccak_256: digest is 32 bytes", () => {
  assert.equal(keccak_256(utf8Bytes("entviz")).length, 32);
});
