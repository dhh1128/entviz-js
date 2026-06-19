# entviz-js

[![CI](https://github.com/dhh1128/entviz-js/actions/workflows/ci.yml/badge.svg)](https://github.com/dhh1128/entviz-js/actions/workflows/ci.yml)
[![npm (@entviz/core)](https://img.shields.io/npm/v/@entviz/core.svg?label=%40entviz%2Fcore)](https://www.npmjs.com/package/@entviz/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

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

## Spec version & drift

Each rendered SVG stamps the entviz spec revision it targets
(`SPEC_VERSION` in `packages/core/src/entviz.ts`, currently **v7**). The spec
and its reference Python impl live in the [entviz](https://github.com/dhh1128/entviz)
repo and move independently; this port can lag. CI's `conformance` job checks
out the reference, compares `SPEC_VERSION` against ours, and:

- **versions match (or we're ahead):** runs the certified Tier-A subset as a
  hard gate;
- **reference is ahead:** emits a loud `::warning` ("an upgrade is needed") and
  runs the corpus informationally — so spec drift is always visible without
  blocking unrelated work.

As of this writing the reference is at **v10** while this port targets **v7**;
the unported parsers and the v8–v10 render-model changes are tracked in
[`CERTIFICATION.md`](CERTIFICATION.md).

## Releasing

**Versioning policy:** the release **minor tracks the entviz spec major** this
port targets — the version is `0.<SPEC_MAJOR>.<patch>`, where `SPEC_MAJOR` is
read from `SPEC_VERSION` in `packages/core/src/entviz.ts`. The minor is derived,
never hand-typed: while the spec major is unchanged, releases are patch bumps
(`0.7.0 → 0.7.1`); bumping `SPEC_VERSION` (e.g. to `"v10"` once the v8–v10
renderer work is ported) makes the next release `0.10.0` automatically. So the
version always advertises the spec level honestly.

Releases are cut by a maintainer with the human-run script (pushes to `main`
and tags are reserved for humans — agents must not run it):

```sh
node scripts/release.mjs                 # derive next version from SPEC_VERSION
node scripts/release.mjs -m "…"          # ... with a custom commit message
node scripts/release.mjs --set 1.0.0     # explicit override (escape hatch)
```

It guards (on `main`, clean, in sync with origin), warns if the spec has moved
ahead, runs the tests, bumps **both** packages in lockstep (keeping
`@entviz/react`'s pin on `@entviz/core` exact), refreshes the lockfile, commits
(signed off), and pushes a `vX.Y.Z` tag. The tag triggers
`.github/workflows/release.yml`, which re-verifies the tag matches the manifest,
runs the tests, and publishes to npm with provenance.

The first release publishes **`@entviz/core` only**; `@entviz/react` is held
back until core is on npm and proven (the workflow has a one-line spot to enable
it). Publishing requires an `NPM_TOKEN` repository secret (an npm automation
token with publish rights to the `@entviz` scope).

## License

[Apache License 2.0](LICENSE). See also [`NOTICE`](NOTICE).
