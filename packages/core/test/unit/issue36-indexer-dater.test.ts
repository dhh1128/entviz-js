import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, parseCesr } from "../../src/entviz.ts";
import { characterize, renderLabel } from "../../src/characterize.ts";

// Issue #36 — the CESR recognizer must cover the Indexer table (indexed
// signatures) and the Dater (datetime) Matter code, instead of dropping them to
// the `raw` base64url fallback. Ported from the Python reference test
// tests/test_issue36_indexer_dater.py; the vectors are authoritative, generated
// from keripy 1.1.33 (keri.core.coring Siger / Dater) and hardcoded here.
//
// * Indexed signatures ARE in scope — a 64-byte controller/witness signature is
//   exactly the high-entropy cryptographic material entviz compares. Every
//   IdrDex variant of one algorithm (current-only "crt", "big" dual-index)
//   collapses to ONE label; the code+index chars stay in the core, so they still
//   drive the cells. Role -> signature.
// * The Dater is recognized only to LABEL it correctly, not to endorse
//   visualizing a datetime as entropy. It carries NO role: role is null, NOT the
//   `key` default. See this.i:idxs1gs0.

// [qb64, expected CESR label] — one per length class and per algorithm, small +
// big variants.
const INDEXED_SIGS: [string, string][] = [
  // small (hs1/hs2), fs 88 / 156
  ["ABCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "Ed25519 idx sig"],
  ["BDCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "Ed25519 idx sig"],
  ["CCCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "secp256k1 idx sig"],
  ["EFCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "secp256r1 idx sig"],
  ["0ACCAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5", "Ed448 idx sig"],
  // big (hs2), fs 92 / 160
  ["2AAFAFCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "Ed25519 idx sig"],
  ["2CABABCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "secp256k1 idx sig"],
  ["2EAHAHCfhtCBiEx9ZZov6qDFWtAVn4bQgYhMfWWaL-qgxVrQFZ-G0IGITH1lmi_qoMVa0BWfhtCBiEx9ZZov6qDFWtAV", "secp256r1 idx sig"],
  ["3AAADAADAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5", "Ed448 idx sig"],
];

// keri.core.coring.Dater(dts="2020-08-22T17:50:09.988921+00:00").qb64
const DATER = "1AAG2020-08-22T17c50c09d988921p00c00";

test("indexed sigs recognized, not raw", () => {
  for (const [qb64, label] of INDEXED_SIGS) {
    const answer = parseCesr(qb64);
    assert.ok(answer !== null, `indexed sig fell through to raw: ${qb64}`);
    assert.equal(answer.type, `CESR ${label}`, qb64);
    // The derivation code + index stay IN the core (rendered in cells and
    // hashed), like every other CESR primitive; nothing is split to prefix.
    assert.equal(answer.prefix, null);
    assert.equal(answer.core, qb64);
  }
});

test("indexed sigs dispatch via parse()", () => {
  for (const [qb64, label] of INDEXED_SIGS) {
    const answer = parse(qb64);
    assert.ok(answer !== null && answer.type === `CESR ${label}`);
  }
});

test("indexed sig role is signature", () => {
  for (const [qb64, label] of INDEXED_SIGS) {
    const ch = characterize(qb64);
    assert.equal(ch.scheme, "cesr");
    assert.equal(ch.role, "signature");
    assert.deepEqual(ch.qualifiers, { algorithm: label });
  }
});

test("indexed sig label projection", () => {
  // Top strip reads "CESR, <algo> idx sig"; there is no " pubkey" to strip.
  const { top } = renderLabel(characterize(INDEXED_SIGS[0][0]));
  assert.equal(top, "CESR, Ed25519 idx sig");
});

test("Matter vs Indexer disambiguation by length", () => {
  // A 44-char 'A...' is the Matter Ed25519 SEED; an 88-char 'A...' is the
  // Indexer signature. Length must decide, not the leading char alone.
  const seed = "A" + "A".repeat(43); // 44 chars, base64url
  assert.equal(parseCesr(seed)?.type, "CESR Ed25519 seed");
  const sig = INDEXED_SIGS[0][0];
  assert.ok(sig.length === 88 && sig[0] === "A");
  assert.equal(parseCesr(sig)?.type, "CESR Ed25519 idx sig");
});

test("Dater recognized, not raw", () => {
  const answer = parseCesr(DATER);
  assert.ok(answer !== null, "Dater fell through to raw");
  assert.equal(answer.type, "CESR datetime");
  assert.equal(answer.core, DATER);
});

test("Dater role is null, not key", () => {
  const ch = characterize(DATER);
  assert.equal(ch.scheme, "cesr");
  // A datetime is recognized but carries NO closed-enum role — it MUST NOT
  // default to "key" (the reason we special-case it).
  assert.equal(ch.role, null);
  assert.deepEqual(ch.qualifiers, { algorithm: "datetime" });
});

test("Dater label projection", () => {
  const { top } = renderLabel(characterize(DATER));
  assert.equal(top, "CESR, datetime");
});
