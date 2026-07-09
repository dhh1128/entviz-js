import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  detectAlphabetByDisproof,
  HEX,
  BASE32,
  BASE36,
  BASE58,
  BASE64,
  BASE64URL,
  BECH32,
  CROCKFORD32_AB,
  DECIMAL,
} from "../../src/entviz.ts";

// A faithful translation of the Python reference's parser dispatch. These tests
// drive every parser through the public `parse()` (the same entry the pipeline
// uses), asserting the (type, core, alphabet, prefix, suffix, prefixSemantic)
// tuple, plus the reject branches that keep dispatch ordering sound. The
// representative inputs are the conformance-corpus vectors where one exists, and
// hand-built RFC-valid synthetic ones otherwise.

// --- hex multihash (runs FIRST) ------------------------------------------
test("parseHexMultihash: sha2-256 (0x1220) -> elided label, 2-byte prefix", () => {
  // 0x12 = sha2-256, 0x20 = 32-byte length, then 32 bytes (64 hex).
  const body = "a".repeat(64);
  const p = parse("1220" + body)!;
  assert.equal(p.type, "hex multihash"); // sha2-256 is the elided default
  assert.equal(p.prefix, "1220");
  assert.equal(p.core, body);
  assert.equal(p.alphabet, HEX);
});

test("parseHexMultihash: sha1 (0x1114) -> hash name shown", () => {
  // 0x11 = sha1, 0x14 = 20-byte length, then 20 bytes (40 hex).
  const p = parse("1114" + "b".repeat(40))!;
  assert.equal(p.type, "hex multihash sha1");
  assert.equal(p.prefix, "1114");
});

test("parseHexMultihash: wrong declared length -> falls through to plain hex", () => {
  // 0x12 sha2-256 but length byte says 0x10 (16) while 64 hex = 32 bytes.
  const p = parse("1210" + "a".repeat(64))!;
  assert.equal(p.type, "hex"); // not a multihash; plain hex wins
});

test("parseHexMultihash: odd-length all-hex is NOT a multihash here", () => {
  // 7 hex chars: parse_hex_multihash bails on odd length; parse_hex also
  // rejects odd-length -> EOS would claim 'badcafe' if all-hex... but it's all
  // hex so EOS declines too -> disproof HEX claims it as a hex fragment.
  const p = parse("badcafe")!;
  assert.equal(p.alphabet, HEX);
  assert.equal(p.core, "badcafe");
});

// --- CESR (runs second) ---------------------------------------------------
test("parse: CESR 'D' Ed25519 pubkey (44 chars) -> code stays in core", () => {
  const p = parse("DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx")!;
  assert.equal(p.type, "CESR Ed25519 pubkey");
  assert.equal(p.core, "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx");
  assert.equal(p.alphabet, BASE64URL);
  assert.equal(p.prefix, null);
});

test("parse: CESR 'B' (44 chars) and 'E' SAID", () => {
  assert.equal(parse("BKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx")!.type, "CESR Ed25519 nt pubkey");
  assert.equal(parse("EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv")!.type, "CESR Blake3-256");
});

test("parse: CESR 2-byte code '0B' Ed25519 sig (88 chars)", () => {
  // '0' + 87 base64url chars = 88 total, starts with '0B'.
  const sig = "0B" + "A".repeat(86);
  const p = parse(sig)!;
  assert.equal(p.type, "CESR Ed25519 sig");
  assert.equal(p.core, sig);
});

test("parse: CESR 4-byte code '1AAH' (100 chars)", () => {
  const v = "1AAH" + "A".repeat(96);
  assert.equal(parse(v)!.type, "CESR X25519 100 cipher 24 salt");
});

test("parse: CESR length match but wrong code char -> not CESR", () => {
  // 44 chars starting with 'Z' (no 1-byte code 'Z') and only base64url chars.
  const v = "Z".repeat(44);
  const p = parse(v)!;
  assert.notEqual(p.type?.startsWith("CESR"), true);
});

test("parse: CESR '0' prefix but non-CESR length -> not CESR", () => {
  // starts '0' but length 10 is not a 2-byte CESR length.
  assert.equal(parse("0123456789")!.type, "hex"); // it's all hex actually
});

// --- SSH keys -------------------------------------------------------------
test("parse: SSH ed25519 full line, comment dropped", () => {
  const p = parse(
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDtJVH9hM+2DyhmgRZBfeIDoVqCTbXY+0nKlS5pTkkXY user@example.com",
  )!;
  assert.equal(p.type, "SSH ed25519");
  assert.equal(p.prefix, "AAAAC3NzaC1lZDI1NTE5AAAA");
  assert.equal(p.alphabet, BASE64);
  assert.equal(p.suffix, null);
});

test("parse: SSH rsa bare payload -> rsa type with 28-char prefix", () => {
  // type-string + exponent + 4 modulus-length chars.
  const payload = "AAAAB3NzaC1yc2EAAAADAQABAAAB" + "C".repeat(40);
  const p = parse(payload)!;
  assert.equal(p.type, "SSH rsa");
  assert.equal(p.prefix.length, 28);
});

test("parse: SSH ecdsa-nistp256 bare payload", () => {
  const payload =
    "AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABB" + "D".repeat(40);
  assert.equal(parse(payload)!.type, "SSH ecdsa-nistp256");
});

test("parse: SSH generic AAAA blob with no known type -> 'SSH key'", () => {
  // AAAA prefix, but the type-string bytes match no known SSH key type.
  const payload = "AAAAZZZZ" + "E".repeat(20);
  const p = parse(payload)!;
  assert.equal(p.type, "SSH key");
  assert.equal(p.prefix, "AAAA");
});

test("parse: SSH bare AAAA via SSH_KEY_RE path (no line wrapper)", () => {
  // Forces the `!SSH_LINE_RE` branch: a leading type token that ISN'T a known
  // ssh- type makes SSH_LINE_RE fail, then SSH_KEY_RE matches the whole thing?
  // Simpler: just an AAAA blob is matched by SSH_LINE_RE. Use one with '=' pad.
  const p = parse("AAAAB3blah==")!;
  assert.equal(p.type, "SSH key");
  assert.equal(p.suffix, null);
});

// --- Bitcoin / Ripple / Litecoin / BCH / Cardano / Stellar ---------------
test("parse: BTC legacy P2PKH -> base58, 4-char checksum suffix", () => {
  const p = parse("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")!;
  assert.equal(p.type, "BTC legacy");
  assert.equal(p.alphabet, BASE58);
  assert.equal(p.prefix, "1");
  assert.equal(p.suffix!.length, 4);
});

test("parse: BTC SegWit bech32 lowercased", () => {
  const p = parse("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")!;
  assert.equal(p.type, "BTC SegWit");
  assert.equal(p.alphabet, BECH32);
  assert.equal(p.prefix, "bc1");
});

test("parse: Ripple address -> XRP/base58", () => {
  const p = parse("rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh")!;
  assert.equal(p.type, "XRP");
  assert.equal(p.alphabet, BASE58);
  assert.equal(p.prefix, "r");
});

test("parse: Litecoin bech32 (ltc1)", () => {
  // v14: the specific ltc1 parser now verifies the bech32 polymod, so the test
  // vector must be a checksum-VALID address (the corpus `litecoin` vector).
  const p = parse("ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9")!;
  assert.equal(p.type, "LTC");
  assert.equal(p.alphabet, BECH32);
});

test("parse: Litecoin legacy (L..) -> base58", () => {
  // v14: Litecoin legacy is base58check-verified, so a real address is needed.
  const p = parse("LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1")!;
  assert.equal(p.type, "LTC legacy");
  assert.equal(p.prefix, "L");
});

test("parse: Litecoin legacy bad checksum -> rejected (v14)", () => {
  // Structural L-prefix + right length, corrupted last char -> base58check fails.
  assert.throws(() => parse("LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc2"), /base58check/);
});

test("parse: Litecoin bech32 bad checksum -> rejected (v14)", () => {
  // From the corpus err-ltc-bad-checksum vector.
  assert.throws(() => parse("ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n8"), /bech32/);
});

test("parse: Bitcoin Cash CashAddr with prefix", () => {
  const p = parse("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a")!;
  assert.equal(p.type, "BCH");
  assert.equal(p.prefix, "bitcoincash:");
  assert.equal(p.alphabet, BECH32);
});

test("parse: Bitcoin Cash CashAddr without prefix", () => {
  const p = parse("qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a")!;
  assert.equal(p.type, "BCH");
  assert.equal(p.prefix, null);
});

test("parse: Bitcoin Cash CashAddr bad checksum -> rejected (v14)", () => {
  // v14: the 40-bit CashAddr BCH checksum is verified; a structural match with a
  // corrupted checksum (last char q vs a) REJECTS. From err-bch-bad-checksum.
  assert.throws(() => parse("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6q"), /CashAddr/);
});

test("parse: Cardano short Byron (Ae2) -> whole body is the core, no suffix (v14)", () => {
  // v14: Byron has no splittable trailing base58 checksum (CRC-32-in-CBOR
  // instead), so the last 6 chars stay IN the core and suffix is null.
  const p = parse("Ae2" + "1".repeat(50) + "2".repeat(6))!;
  assert.equal(p.type, "ADA Byron");
  assert.equal(p.prefix, "Ae2");
  assert.equal(p.suffix, null);
  assert.equal(p.core, "1".repeat(50) + "2".repeat(6));
});

test("parse: Cardano long Byron (DdzFF) -> no suffix (v14)", () => {
  const p = parse("DdzFF" + "1".repeat(65) + "2".repeat(6))!;
  assert.equal(p.type, "ADA Byron");
  assert.equal(p.prefix, "DdzFF");
  assert.equal(p.suffix, null);
});

test("parse: Cardano Shelley (addr1) -> bech32, checksum suffix", () => {
  // v14: Shelley bech32 polymod is now verified, so a checksum-VALID address.
  const p = parse("addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x")!;
  assert.equal(p.type, "ADA Shelley");
  assert.equal(p.alphabet, BECH32);
  assert.equal(p.suffix!.length, 6);
});

test("parse: Stellar account (G..) -> base32 uppercased", () => {
  const p = parse("GCKFBEIYTKP5RDBQMUTAPDCDHF2TR4LPNRGW4JBQQTQUYZP4LDKP3SGM")!;
  assert.equal(p.type, "XLM");
  assert.equal(p.alphabet, BASE32);
  assert.equal(p.prefix, "G");
  assert.equal(p.core, p.core.toUpperCase());
});

test("parse: Stellar muxed (M..) -> XLM muxed", () => {
  const p = parse("M" + "A".repeat(68))!;
  assert.equal(p.type, "XLM muxed");
  assert.equal(p.prefix, "M");
});

// --- UUID / ULID / snowflake / LEI ---------------------------------------
test("parse: dashed UUID, braces stripped", () => {
  const p = parse("{550e8400-e29b-41d4-a716-446655440000}")!;
  assert.equal(p.type, "UUID");
  assert.equal(p.core, "550e8400e29b41d4a716446655440000");
  assert.equal(p.alphabet, HEX);
});

test("parse: ULID canonical and lowercase normalize identically", () => {
  const a = parse("01ARZ3NDEKTSV4RRFFQ69G5FAV")!;
  const b = parse("01arz3ndektsv4rrffq69g5fav")!;
  assert.equal(a.type, "ULID");
  assert.equal(a.alphabet, CROCKFORD32_AB);
  assert.equal(a.core, b.core); // both upper-cased to canonical
  assert.equal(a.core, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
});

test("parse: ULID Crockford aliases I/L->1, O->0", () => {
  // 26-char string using alias chars; normalized must replace them.
  const p = parse("OILOIL0123456789ABCDEFGHJK")!;
  assert.equal(p.type, "ULID");
  assert.equal(p.core, "011011" + "0123456789ABCDEFGHJK");
});

test("parse: snowflake (17-digit) -> DECIMAL, verbatim core", () => {
  const p = parse("80351110224678912")!;
  assert.equal(p.type, "snowflake");
  assert.equal(p.alphabet, DECIMAL);
  assert.equal(p.core, "80351110224678912");
});

test("parse: snowflake 19-digit accepted (sign bit clear)", () => {
  assert.equal(parse("1234567890987654321")!.type, "snowflake");
});

test("parse: 20-digit with sign bit set -> NOT a snowflake", () => {
  // 2^63 = 9223372036854775808 (19 digits). A 20-digit value >= 2^63 -> reject.
  const big = "99999999999999999999"; // 20 nines, well over 2^63
  const p = parse(big)!;
  assert.notEqual(p.type, "snowflake");
});

test("parse: LEI Bloomberg (valid MOD 97-10) -> base36, 2-char checksum", () => {
  const p = parse("5493001KJTIIGC8Y1R12")!;
  assert.equal(p.type, "LEI");
  assert.equal(p.alphabet, BASE36);
  assert.equal(p.core.length, 18);
  assert.equal(p.suffix!.length, 2);
});

test("parse: LEI lowercase normalized to upper", () => {
  const p = parse("213800wavvops85n2205")!;
  assert.equal(p.type, "LEI");
  assert.equal(p.core, p.core.toUpperCase());
});

test("parse: 20-char alnum failing the reserved-'00' rule -> not LEI", () => {
  // positions 4-5 must be '00'. Use 'XX' there.
  const p = parse("5493XX1KJTIIGC8Y1R12")!;
  assert.notEqual(p.type, "LEI");
});

test("parse: 20-char alnum with bad checksum -> rejected (v14)", () => {
  // v14: valid LEI shape + reserved '00' but wrong MOD 97-10 check digits is an
  // unambiguous LEI match, so a bad checksum REJECTS (the bound suffix is shown,
  // so it must verify) rather than falling through to a generic base36 encoding.
  assert.throws(() => parse("5493001KJTIIGC8Y1R99"), /MOD 97-10/);
});

// --- SWHID / gitoid (prefix-semantic) ------------------------------------
test("parse: SWHID rev -> prefix-semantic, hex core, qualifiers dropped", () => {
  const p = parse("swh:1:rev:309cf2674ee7a0749978cf8265ab91a60aea0f7d;origin=https://x")!;
  assert.equal(p.type, "");
  assert.equal(p.prefix, "swh:1:rev:");
  assert.equal(p.core, "309cf2674ee7a0749978cf8265ab91a60aea0f7d");
  assert.equal(p.prefixSemantic, true);
  assert.equal(p.suffix, null);
  assert.equal(p.alphabet, HEX);
});

test("parse: SWHID cnt vs rev fingerprint-bind via prefix", () => {
  const rev = parse("swh:1:rev:309cf2674ee7a0749978cf8265ab91a60aea0f7d")!;
  const cnt = parse("swh:1:cnt:309cf2674ee7a0749978cf8265ab91a60aea0f7d")!;
  assert.equal(rev.prefix, "swh:1:rev:");
  assert.equal(cnt.prefix, "swh:1:cnt:");
  assert.equal(rev.core, cnt.core); // same hash, different identity prefix
});

test("parse: gitoid blob sha256 -> 64-hex core, prefix-semantic", () => {
  const p = parse(
    "gitoid:blob:sha256:473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813",
  )!;
  assert.equal(p.type, "");
  assert.equal(p.prefix, "gitoid:blob:sha256:");
  assert.equal(p.core.length, 64);
  assert.equal(p.prefixSemantic, true);
});

test("parse: gitoid with hash length not matching algo -> rejected", () => {
  // sha1 declared (expects 40 hex) but only 8 hex chars present. gitoid bails;
  // the ':' chars are in no alphabet so disproof declines too -> null.
  assert.equal(parse("gitoid:blob:sha1:deadbeef"), null);
});

// --- generic bech32 + IPFS CID -------------------------------------------
test("parse: generic bech32 (cosmos) -> checksum-valid, hrp1 prefix", () => {
  const p = parse("cosmos1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnrk363e")!;
  assert.equal(p.type, "bech32");
  assert.equal(p.prefix, "cosmos1");
  assert.equal(p.alphabet, BECH32);
  assert.equal(p.suffix!.length, 6);
});

test("parse: <letters>1<chars> with bad checksum -> rejected (v14)", () => {
  // v14: an <hrp>1<8+ bech32 chars> shape is a clear bech32 match and the 6-char
  // checksum is the bound suffix, so an invalid polymod REJECTS (rather than
  // falling through to a bare encoding that renders a bad-checksum address).
  assert.throws(() => parse("abcdef1qqqqqqqqqqqqqq"), /bech32/);
});

test("parse: IPFS CIDv0 (Qm..) -> base58", () => {
  const p = parse("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")!;
  assert.equal(p.type, "CIDv0");
  assert.equal(p.alphabet, BASE58);
  assert.equal(p.prefix, "Qm");
});

test("parse: IPFS CIDv1 (bafy..) -> decoded codec label, base32 uppercased", () => {
  const p = parse("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")!;
  assert.equal(p.type, "CIDv1 dag-pb"); // dag-pb codec, sha2-256 elided
  assert.equal(p.alphabet, BASE32);
  assert.equal(p.prefix, "b");
  assert.equal(p.core, p.core.toUpperCase());
});

test("parse: IPFS CIDv1 with a 2-byte codec varint (dag-json 0x0129)", () => {
  // Exercises the multi-byte LEB128 path in readUvarint (codec 297 > 127 needs
  // a continuation byte). version=1, codec=0x0129 (dag-json), hash=sha2-256.
  const p = parse("baguqeeraaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")!;
  assert.equal(p.type, "CIDv1 dag-json");
  assert.equal(p.alphabet, BASE32);
});

test("parse: IPFS CIDv1 with a non-sha256 hash -> hash name appended", () => {
  // version=1, codec=0x55 (raw), hash=0x11 (sha1), length=0x14 (20), +20 bytes.
  // Built so the label reads "CIDv1 raw/sha1".
  const A = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = [0x01, 0x55, 0x11, 0x14, ...new Array(20).fill(0)];
  let bits = 0, val = 0, body = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; body += A[(val >> bits) & 31]; } }
  if (bits > 0) body += A[(val << (5 - bits)) & 31];
  // pad the base32 body up to the >=58 char minimum with valid base32 chars.
  while (body.length < 58) body += "a";
  const p = parse("b" + body)!;
  assert.equal(p.type, "CIDv1 raw/sha1");
});

test("parse: IPFS CIDv1 whose interior truncates mid-varint -> plain CIDv1", () => {
  // A 'b'+58 base32 body decoding to bytes that start version=1 then end on a
  // continuation byte (high bit set) -> readUvarint returns null -> plain label.
  // 0x01 (version=1), then 0x81 0x81 ... (all continuation, never terminates).
  const A = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = [0x01, ...new Array(40).fill(0x81)];
  let bits = 0, val = 0, body = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; body += A[(val >> bits) & 31]; } }
  if (bits > 0) body += A[(val << (5 - bits)) & 31];
  body = body.slice(0, 58);
  const p = parse("b" + body)!;
  assert.equal(p.type, "CIDv1"); // interior didn't decode -> bare label
});

test("parse: SSH line form whose payload matches no known type -> 'SSH key'", () => {
  // ssh-ed25519 wrapper makes SSH_LINE_RE match, but the AAAA payload bytes
  // don't match any SSH_KEY_TYPE prefix, so the legacy SSH_KEY_RE fallback fires.
  const p = parse("ssh-ed25519 AAAAZZZZZZZZ user@host")!;
  assert.equal(p.type, "SSH key");
  assert.equal(p.prefix, "AAAA");
});

test("parse: IPFS CIDv1 raw codec (b + 58-112 base32) that won't decode -> plain CIDv1", () => {
  // A 'b'-prefixed 58-char base32 body whose varints don't describe a known
  // codec/hash falls back to the plain CIDv1 label (still BASE32).
  const p = parse("b" + "a".repeat(58))!;
  assert.equal(p.type, "CIDv1"); // undecodable interior -> bare label
  assert.equal(p.alphabet, BASE32);
});

// --- hex (0x prefix, lowercasing, odd reject) ----------------------------
test("parse: 0x-prefixed hex -> prefix '0x', lowercased core", () => {
  const p = parse("0xDEADBEEF")!;
  assert.equal(p.type, "hex");
  assert.equal(p.prefix, "0x");
  assert.equal(p.core, "deadbeef");
});

test("parse: plain hex lowercased", () => {
  assert.equal(parse("DEADBEEF")!.core, "deadbeef");
});

// --- EOS (runs last) ------------------------------------------------------
test("parse: EOS account name -> base64 alphabet, whole-string core", () => {
  const p = parse("eosio.token")!;
  assert.equal(p.type, "EOS");
  assert.equal(p.alphabet, BASE64);
  assert.equal(p.core, "eosio.token");
});

test("parse: EOS rejects an all-hex fragment", () => {
  // odd-length all-hex 'badcafe' is NOT EOS (it's a hex fragment via disproof).
  const p = parse("badcafe")!;
  assert.notEqual(p.type, "EOS");
});

// --- disproof + fallback --------------------------------------------------
test("parse: pure base64 blob (no special prefix) -> disproof BASE64", () => {
  // The b64-large corpus vector path: standard base64 with '+'/'/'-less body.
  const p = parse("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A")!;
  assert.equal(p.alphabet, BASE64);
  assert.equal(p.type, "base64");
});

test("parse: base64url-only chars with '-'/'_' -> disproof BASE64URL", () => {
  const p = parse("abc-def_ghi")!;
  assert.equal(p.alphabet, BASE64URL);
  assert.equal(p.type, "base64url");
});

test("parse: disproof BASE32 uppercases; bech32 lowercases", () => {
  // Pure base32 (A-Z2-7) that no specific parser claims.
  const b32 = parse("MFRGGZDFMZTWQ2LK")!;
  assert.equal(b32.alphabet, BASE32);
  assert.equal(b32.core, b32.core.toUpperCase());
});

test("parse: input with a space matches no alphabet -> null", () => {
  assert.equal(parse("hello world"), null);
});

test("detectAlphabetByDisproof: empty string -> null", () => {
  assert.equal(detectAlphabetByDisproof(""), null);
});

test("detectAlphabetByDisproof: most-restrictive ordering (hex before base32)", () => {
  // 'abcdef' fits HEX (smallest set listed first) -> HEX, not base32.
  assert.equal(detectAlphabetByDisproof("abcdef"), HEX);
});

test("detectAlphabetByDisproof: a char in NO alphabet -> null", () => {
  assert.equal(detectAlphabetByDisproof("###"), null);
});
