# entviz-js

TypeScript implementation of [entviz](https://github.com/dhh1128/entviz) (spec
**v7**) — visualize high-entropy values as comparable SVG diagrams — plus a
React component. An npm workspace:

- **`packages/core`** (`@entviz/core`) — the renderer. Pure TypeScript, runs
  under Node's native type-stripping (Node ≥ 22.6); zero runtime dependencies
  beyond `node:crypto`.
- **`packages/react`** (`@entviz/react`) — a thin React component over the core.

## Status

The core is **certified** against the shared entviz conformance corpus at
**Tier A (render model) + Tier B (canonical raster)** for every vector whose
parser is ported:

| Ported | hex, UUID (dashed/undashed), UTF-8→base64url fallback; note + font-size error handling |
|---|---|
| Certified | 24/24 supported corpus vectors (19 render + 5 error) — Tier A + Tier B |
| Not yet ported | the blockchain / CESR / SSH / SWHID / gitoid / LEI / snowflake / CID / ULID / base32 / bech32 / base58 / Ethereum-EIP-55 parsers, and the >512-bit large-input branch |

The unported parsers are mechanical follow-ons; the shared core (fingerprint,
tokenization, quant extension, ftok median/quartile, grid + blank-shift, Oklab
colors, geometry, surround, ellipse, color bar, blank-cell map, quartile marks,
labels) is complete and proven correct by the corpus.

## Usage

```ts
import { render } from "@entviz/core";
const svg = render("550e8400-e29b-41d4-a716-446655440000");      // -> SVG string
const svg2 = render("0123…", { targetAr: 2.0, fontSizePt: 16, note: "git" });
```

## Develop

```sh
cd packages/core
node --test test/*.test.ts          # unit tests (8)
```

## Conformance

Certified through the entviz repo's `compliance/` runner, which pipes each
corpus vector's `input.json` to the CLI on stdin and compares the SVG it writes
to stdout against the golden render model + raster:

```sh
# from the entviz repo:
PYTHONPATH=src:. python -m compliance.runner \
  --impl-cmd 'node /path/to/entviz-js/packages/core/src/cli.ts' \
  --only 'hex-64,hex-128,…'         # the supported subset
```

## License

[Apache License 2.0](LICENSE). See also [`NOTICE`](NOTICE).
