# Conformance certification — @entviz/core

**Spec:** entviz v10 · **Corpus:** entviz `compliance/` · **Tiers:** A (render
model) + B (canonical raster, cairosvg) · **Result:** 27/27 supported vectors.

Run from the entviz repo:

```sh
PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node /home/daniel/code/entviz-js/packages/core/src/cli.ts' \
  --only 'hex-64,hex-128,hex-256,hex-512,uuid-dashed,uuid-undashed,uuid-nil,uuid-max,avalanche-a,avalanche-b,ar-1x1,ar-2x1,ar-1x2,fs-6,fs-12,fs-24,text-hello,text-lorem,note-git,eth-lower,eth-checksummed,err-eip55-bad-checksum,err-note-too-long,err-note-space,err-note-punct,err-fontsize-low,err-fontsize-high'
# -> 27/27 vectors passed
```

## Covered (27)

21 render vectors (hex × 4 sizes, UUID × 4, avalanche × 2, aspect ratio × 3,
font size × 3, UTF-8 fallback × 2, note × 1, Ethereum × 2) + 6 error vectors
(note length / charset × 3, font-size range × 2, EIP-55 bad checksum × 1).

Ethereum addresses (EIP-55) are fully ported: lowercase and valid-checksum
mixed-case addresses render; a bad-checksum mixed-case address is **rejected**
(fails closed), backed by a pure-TypeScript Keccak-256 (`src/keccak.ts`).

## Not yet covered (parsers to port)

The remaining corpus vectors need format-specific parsers not yet ported:
base58 (BTC/Ripple/CIDv0), bech32 (segwit/litecoin/cosmos/cashaddr), base32
(Stellar/CIDv1), crockford32 (ULID), base36 (LEI), decimal (snowflake), CESR,
SSH, SWHID/gitoid; plus the >512-bit large-input branch (`hex-1024`,
`b64-large`). These are mechanical additions on top of the proven shared core.
