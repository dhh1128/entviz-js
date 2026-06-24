# Conformance certification — @entviz/core

**Spec:** entviz v11 · **Corpus:** entviz `compliance/` · **Tiers:** A (render
model) + B (canonical raster, cairosvg) · **Result:** 52/76 corpus vectors —
every vector whose parser is ported passes; the remaining 24 need parsers not
yet ported (listed below).

Run from the entviz repo against the whole corpus:

```sh
PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node /home/daniel/code/entviz-js/packages/core/src/cli.ts'
# -> 52/76 vectors passed (the 24 failures are all unported parsers)
```

## Covered (52)

The full shared render model — short-input **and** the >512-bit large-input
branch (head + 4 Crockford-base32 fingerprint-middle cells + tail) — plus these
parsers:

- **hex** × 4 sizes, **UUID** × 4 (dashed/undashed/nil/max)
- **UTF-8 → base64url** fallback × 2, **note** × 3, **aspect-ratio** × 3,
  **font-size** × 3, **avalanche** × 2
- **Ethereum (EIP-55)** × 2 — lowercase and valid-checksum mixed-case render; a
  bad-checksum mixed-case address is **rejected** (fails closed), backed by the
  audited [`@noble/hashes`](https://github.com/paulmillr/noble-hashes)
  `keccak_256` (original-Keccak EIP-55 variant, not NIST SHA3-256)
- **DID** (W3C DID Core) × 15 — `did:<method>:` is bound to the fingerprint via
  the v11 **prefix-fold**; the DID-URL tail (`/…?…#…`) is dropped; the
  method-specific-id is the verbatim, case-sensitive core (base64url). Includes
  the large `did-jwk-large` and `did-peer-2`, which take the large-input path.
- **URN** (RFC 8141) × 7 — same prefix-fold; the `urn:<nid>:` scheme+NID are
  lowercased (case-insensitive) while the NSS is kept verbatim; the r-/q-/f-
  components are dropped
- **6 error vectors** — note length × 1, note charset × 2, font-size range × 2,
  EIP-55 bad checksum × 1

`hex-1024` (large input) renders **model- and raster-identical** to the golden,
including the `spec_version` stamp — this port and the reference are both on
**v11**, so the version-stamp drift noted in earlier releases is gone.

## Not yet covered (24 — parsers to port)

The remaining corpus vectors need format-specific parsers not yet ported:
base58 (BTC legacy/segwit/p2wsh, Ripple, CIDv0, bitcoincash), bech32
(segwit/litecoin/cosmos), base32 (Stellar, CIDv1), crockford32 (ULID),
base36 (LEI), decimal (snowflake), CESR (AID/SAID), SSH (ed25519),
SWHID/gitoid, and `b64-large` (the base64 alphabet-disproof parser). These are
mechanical additions on top of the proven shared core.
