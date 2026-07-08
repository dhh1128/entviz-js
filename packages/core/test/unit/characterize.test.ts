import { test } from "node:test";
import assert from "node:assert/strict";
import { characterize } from "../../src/characterize.ts";

// Spec v13 entropy characterization — a port of the Python reference
// entviz/characterize.py. Every expected value below is pinned against the
// Python oracle (the same source the conformance corpus is generated from) or a
// verified corpus vector; the inputs mirror the parser test suite so the two
// stay in lockstep.

test("CESR digest (Blake3-256) — the cesr-said-e corpus vector", () => {
  const c = characterize("EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv");
  assert.equal(c.encoding, "base64url");
  assert.equal(c.scheme, "cesr");
  assert.equal(c.role, "digest");
  assert.deepEqual(c.qualifiers, { algorithm: "Blake3-256" });
  assert.equal(c.sizeBasis, "decoded");
  assert.equal(c.sizeBits, 264); // 33 core bytes * 8, NOT the 256-bit digest
  assert.equal(c.entropyType, "cesr");
  assert.deepEqual(c.parts, [{ text: "EBfdlu8R27Fbx_ehrqwImnK_8Cm79sqbAQ4caaZG_LFv", bind: "core" }]);
});

test("CESR key (Ed25519 pubkey) — role is key, not digest", () => {
  const c = characterize("DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx");
  assert.equal(c.scheme, "cesr");
  assert.equal(c.role, "key");
  assert.deepEqual(c.qualifiers, { algorithm: "Ed25519 pubkey" });
});

test("CESR signature — role is signature", () => {
  // A 2-byte-code 0B (Ed25519 sig), length 88.
  const c = characterize("0B" + "A".repeat(86));
  assert.equal(c.scheme, "cesr");
  assert.equal(c.role, "signature");
  assert.equal(c.qualifiers.algorithm, "Ed25519 sig");
});

test("CIDv1 identifier — version/codec/hash qualifiers", () => {
  const c = characterize("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  assert.equal(c.scheme, "cid");
  assert.equal(c.role, "identifier");
  assert.deepEqual(c.qualifiers, { version: 1, codec: "dag-pb", hash: "sha2-256" });
  assert.equal(c.encoding, "base32");
  assert.equal(c.sizeBits, 288);
  assert.equal(c.parts[0].bind, "none"); // multibase 'b' selector
  assert.equal(c.parts[1].bind, "core");
});

test("CIDv0 identifier — constant dag-pb/sha2-256 qualifiers", () => {
  const c = characterize("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");
  assert.equal(c.scheme, "cid");
  assert.equal(c.role, "identifier");
  assert.deepEqual(c.qualifiers, { version: 0, codec: "dag-pb", hash: "sha2-256" });
});

test("did:ethr — folded prefix, network qualifier, role stays identifier", () => {
  const c = characterize("did:ethr:0x5:0xf3beac30c498d9e26865f34fcaa57dbb935b0d74");
  assert.equal(c.scheme, "did");
  assert.equal(c.role, "identifier"); // NOT address — Wrinkle 3
  assert.deepEqual(c.qualifiers, { method: "ethr", network: "0x5" });
  assert.equal(c.sizeBasis, "utf8");
  assert.equal(c.sizeBits, 368);
  assert.equal(c.entropyType, "did");
  assert.deepEqual(c.parts[0], { text: "did:ethr:", bind: "fold" });
});

test("did:key — role is identifier, NOT key; no network recovered", () => {
  const c = characterize("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK");
  assert.equal(c.scheme, "did");
  assert.equal(c.role, "identifier");
  assert.deepEqual(c.qualifiers, { method: "key" });
  assert.equal(c.sizeBits, 384);
});

test("urn:isbn — role identifier (not book); nid qualifier; utf8 basis", () => {
  const c = characterize("urn:isbn:0451450523");
  assert.equal(c.scheme, "urn");
  assert.equal(c.role, "identifier");
  assert.deepEqual(c.qualifiers, { nid: "isbn" });
  assert.equal(c.sizeBasis, "utf8");
  assert.equal(c.sizeBits, 80); // 10 ascii bytes * 8
  assert.equal(c.entropyType, "urn");
});

test("gitoid — folded scheme, object+algorithm, digest role", () => {
  const c = characterize("gitoid:blob:sha256:473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813");
  assert.equal(c.scheme, "gitoid");
  assert.equal(c.role, "digest");
  assert.deepEqual(c.qualifiers, { object: "blob", algorithm: "sha256" });
  assert.equal(c.encoding, "hex");
  assert.equal(c.sizeBits, 256);
  assert.equal(c.parts[0].bind, "fold");
});

test("swhid — sha1 algorithm, object type, digest role", () => {
  const c = characterize("swh:1:cnt:309cf2674ee7a0749978cf8265ab91a60aea0f7d");
  assert.equal(c.scheme, "swhid");
  assert.equal(c.role, "digest");
  assert.deepEqual(c.qualifiers, { object: "cnt", algorithm: "sha1" });
  assert.equal(c.sizeBits, 160);
});

test("SSH ed25519 — role key, algorithm qualifier (comment dropped)", () => {
  const c = characterize(
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDtJVH9hM+2DyhmgRZBfeIDoVqCTbXY+0nKlS5pTkkXY user@example.com",
  );
  assert.equal(c.scheme, "ssh");
  assert.equal(c.role, "key");
  assert.deepEqual(c.qualifiers, { algorithm: "ed25519" });
  assert.equal(c.encoding, "base64");
});

test("BTC legacy — address role, network+variant, both edge parts bind=none", () => {
  const c = characterize("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  assert.equal(c.scheme, "btc");
  assert.equal(c.role, "address");
  assert.deepEqual(c.qualifiers, { network: "mainnet", variant: "legacy" });
  assert.equal(c.sizeBits, 168);
  assert.equal(c.parts[0].bind, "none"); // '1' version-byte prefix
  assert.equal(c.parts[c.parts.length - 1].bind, "none"); // base58check suffix
});

test("BTC segwit variant", () => {
  const c = characterize("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  assert.equal(c.scheme, "btc");
  assert.equal(c.qualifiers.variant, "segwit");
});

test("LTC legacy variant + LTC bech32 (no variant)", () => {
  const legacy = characterize("L" + "a".repeat(33));
  assert.equal(legacy.scheme, "ltc");
  assert.equal(legacy.role, "address");
  assert.deepEqual(legacy.qualifiers, { network: "mainnet", variant: "legacy" });
  const bech = characterize("ltc1qhw6dgkk52v9eqzukju7vrqpw0jt4wll6e6n4q5");
  assert.equal(bech.scheme, "ltc");
  assert.equal(bech.qualifiers.variant, undefined);
});

test("ADA Byron and Shelley variants — address role", () => {
  const byron = characterize("Ae2" + "1".repeat(50) + "2".repeat(6));
  assert.equal(byron.scheme, "ada");
  assert.equal(byron.role, "address");
  assert.equal(byron.qualifiers.variant, "byron");
  const shelley = characterize("addr1" + "q".repeat(50) + "p".repeat(6));
  assert.equal(shelley.scheme, "ada");
  assert.equal(shelley.qualifiers.variant, "shelley");
});

test("ETH checksummed — address role, eth scheme, no variant", () => {
  const c = characterize("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.equal(c.scheme, "eth");
  assert.equal(c.role, "address");
  assert.deepEqual(c.qualifiers, {});
  assert.equal(c.sizeBits, 160);
});

test("bitcoincash — network recovered from HRP; testnet variant", () => {
  const main = characterize("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a");
  assert.equal(main.scheme, "bch");
  assert.equal(main.qualifiers.network, "mainnet");
  const test = characterize("bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq");
  assert.equal(test.qualifiers.network, "testnet");
});

test("Stellar (G) and muxed (M) — address role", () => {
  const acct = characterize("GCKFBEIYTKP5RDBQMUTAPDCDHF2TR4LPNRGW4JBQQTQUYZP4LDKP3SGM");
  assert.equal(acct.scheme, "stellar");
  assert.equal(acct.role, "address");
  assert.deepEqual(acct.qualifiers, {});
  const muxed = characterize("M" + "A".repeat(68));
  assert.equal(muxed.scheme, "stellar");
  assert.equal(muxed.qualifiers.variant, "muxed");
});

test("XRP and EOS — address schemes", () => {
  const xrp = characterize("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
  assert.equal(xrp.scheme, "xrp");
  assert.equal(xrp.role, "address");
  const eos = characterize("eosio.token");
  assert.equal(eos.scheme, "eos");
  assert.equal(eos.role, "address");
});

test("generic bech32 — hrp qualifier, address role", () => {
  const c = characterize("abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx");
  assert.equal(c.scheme, "bech32");
  assert.equal(c.role, "address");
  assert.equal(c.qualifiers.hrp, "abcdef");
});

test("UUID / ULID / LEI / snowflake — identifier schemes", () => {
  const uuid = characterize("550e8400-e29b-41d4-a716-446655440000");
  assert.equal(uuid.scheme, "uuid");
  assert.equal(uuid.role, "identifier");
  assert.equal(uuid.sizeBits, 128);
  const ulid = characterize("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  assert.equal(ulid.scheme, "ulid");
  assert.equal(ulid.encoding, "crockford32");
  const lei = characterize("5493001KJTIIGC8Y1R12");
  assert.equal(lei.scheme, "lei");
  assert.equal(lei.encoding, "base36");
  const snow = characterize("175928847299117063");
  assert.equal(snow.scheme, "snowflake");
  assert.equal(snow.role, "identifier");
  assert.equal(snow.encoding, "decimal");
  // decimal integer-decode: fits in 8 bytes -> 64 bits (NOT chars*bitsPerChar)
  assert.equal(snow.sizeBits, 64);
});

test("hex multihash — digest role via the multihash branch", () => {
  const c = characterize("12206e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d");
  assert.equal(c.scheme, "multihash");
  assert.equal(c.role, "digest");
  assert.equal(c.sizeBits, 256);
});

test("bare hex — scheme null, role null, entropyType = encoding", () => {
  const c = characterize("deadbeefcafe");
  assert.equal(c.scheme, null);
  assert.equal(c.role, null);
  assert.equal(c.encoding, "hex");
  assert.equal(c.entropyType, "hex");
  assert.equal(c.sizeBasis, "decoded");
  assert.equal(c.sizeBits, 48);
  assert.deepEqual(c.qualifiers, {});
});

test("UTF-8 fallback (text) — scheme null, utf8 basis, size over original bytes", () => {
  const c = characterize("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
  assert.equal(c.scheme, null);
  assert.equal(c.role, null);
  assert.equal(c.encoding, "base64url");
  assert.equal(c.entropyType, "base64url");
  assert.equal(c.sizeBasis, "utf8");
  assert.equal(c.sizeBits, 56 * 8); // 56 ascii bytes
  assert.equal(c.parts.length, 1);
  assert.equal(c.parts[0].bind, "core");
});

test("leading/trailing whitespace is trimmed before parsing", () => {
  const c = characterize("  deadbeefcafe  ");
  assert.equal(c.encoding, "hex");
  assert.equal(c.sizeBits, 48);
});
