# Conformance certification — @entviz/core

**Spec:** entviz v17 · **Corpus:** entviz `compliance/` (pinned `v0.17.0`) ·
**Tiers:** A (render model) + B (canonical raster, cairosvg) · **Result:**
**full conformance — every corpus vector passes**, with no skip list and no
subset.

Run from the entviz repo against the whole corpus:

```sh
PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node /home/daniel/code/entviz-js/packages/core/src/cli.ts' --tiers A
# -> 104/104 vectors passed   (render + error + invariant pairs + spec-version match)

PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node /home/daniel/code/entviz-js/packages/core/src/cli.ts' --tiers B
# -> 97/97 vectors passed   (raster via cairosvg)
```

CI runs both tiers on every push as hard gates (`.github/workflows/ci.yml`:
`conformance` + `conformance-tier-b`), cross-checking out the reference corpus
at the pinned tag `v0.17.0`.

## Coverage

The full shared render model — short-input **and** the >512-bit large-input
branch (head + 4 Crockford-base32 fingerprint-middle cells + tail) — plus the
**complete parser dispatch**, ported in the reference's exact order so
ordering-sensitive cases (e.g. a 26-char all-hex string that is also valid
Crockford resolves to ULID, not hex) match by construction:

- **hex** × 4 sizes, **UUID** × 4 (dashed/undashed/nil/max), **UTF-8 → base64url**
  fallback, **note**/**aspect-ratio**/**font-size** variants, **avalanche**
- **Ethereum (EIP-55)** — lowercase + valid-checksum mixed-case render, bad-checksum
  rejected (fails closed), via the audited
  [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) `keccak_256`
- **DID** (W3C DID Core) and **URN** (RFC 8141) — v11 prefix-fold; includes the
  large `did-jwk-large` / `did-peer-2` on the large-input path
- **base58** — Bitcoin legacy (mainnet + testnet), Ripple, IPFS CIDv0
  (multihash-labeled), Cardano Byron (both `Ae2`/`DdzFF` forms)
- **bech32** — Bitcoin SegWit (incl. P2WSH and testnet), Litecoin, Bitcoin Cash,
  Cardano Shelley (mainnet + testnet, base **and** 29-byte stake forms), nostr
  `npub`/`nsec`, and generic Cosmos-SDK chains (BIP-173/350 checksum-validated).
  **v16:** the HRP is identity and binds
  the fingerprint by prefix-fold on every bech32 path, so HRP siblings over one
  payload (`cosmos1`/`osmo1`, `bc1`/`tb1`, `addr1`/`addr_test1`, `npub`/`nsec`)
  render differently; CashAddr is the deliberate exception and stays unfolded
  with its 8-char checksum in the core
- **v17:** `qualifiers.network` is **derived from the input** on every blockchain
  path — never defaulted — so `testnet` reaches the label as the v14 rule
  requires; Cardano Byron deliberately carries **no** network, since its magic
  lives inside a CBOR payload this parser does not decode
- **base32** (RFC 4648) — Stellar, IPFS CIDv1 (multicodec-labeled via varint decode)
- **crockford32** — ULID · **base36** — GLEIF LEI (ISO 7064 MOD 97-10) ·
  **decimal** — Snowflake (clock-free sign-bit gate)
- **CESR** (KERI AID/SAID derivation codes), **SSH** public keys (ed25519/rsa/
  dss/ecdsa), **SWHID**, **gitoid**, **EOS**, **Cardano**, and the alphabet-
  **disproof** path (e.g. `b64-large`)
- **12 error vectors** — note length/charset, font-size range, EIP-55 bad
  checksum, and the bech32/CashAddr/base58check/LEI bad-checksum rejections
- **7 invariant pairs** — case/format-folding equivalences (UUID dashed≡undashed,
  ULID canonical≡lowercase, DID/URN normalization, …) all render-model-identical

All hashing/encoding stays isomorphic (no `node:crypto`/`Buffer`): `@noble/hashes`
plus the browser-safe helpers in `bytes.ts`, so `@entviz/core` bundles unchanged
for the browser (it backs `@entviz/react`).
