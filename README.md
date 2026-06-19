# entviz-js

[![CI](https://github.com/dhh1128/entviz-js/actions/workflows/ci.yml/badge.svg)](https://github.com/dhh1128/entviz-js/actions/workflows/ci.yml)
[![Release](https://github.com/dhh1128/entviz-js/actions/workflows/release.yml/badge.svg)](https://github.com/dhh1128/entviz-js/actions/workflows/release.yml)
[![npm (@entviz/core)](https://img.shields.io/npm/v/@entviz/core.svg?label=%40entviz%2Fcore)](https://www.npmjs.com/package/@entviz/core)
[![node-current (@entviz/core)](https://img.shields.io/node/v/@entviz/core)](https://www.npmjs.com/package/@entviz/core)
[![types included](https://img.shields.io/npm/types/@entviz/core)](https://www.npmjs.com/package/@entviz/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

TypeScript implementation of [entviz](https://github.com/dhh1128/entviz) (spec
**v10**) — visualize high-entropy values as comparable SVG diagrams — plus a
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
| Not yet ported | the blockchain / CESR / SSH / SWHID / gitoid / LEI / snowflake / CID / ULID / base32 / bech32 / base58 / Ethereum-EIP-55 parsers, and the >512-bit large-input branch (incl. the v9 Crockford-base32 middle cells) |

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
npm test            # both coverage gates (unit ≥80% lines, full 100% lines/funcs)
npm run test:unit   # just the pure unit suite (no render())
npm run test:full   # unit + integration, with the full-coverage thresholds
```

Tests are split into `test/unit/` (pure stage functions — must **not** call
`render()`) and `test/integration/` (end-to-end `render()`), with enforced
coverage floors. See [`AGENTS.md`](AGENTS.md) → *Two test suites + coverage
guardrail* before adding code.

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
(`SPEC_VERSION` in `packages/core/src/entviz.ts`, currently **v10**). The spec
and its reference Python impl live in the [entviz](https://github.com/dhh1128/entviz)
repo and move independently; this port can lag. CI's `conformance` job checks
out the reference, compares `SPEC_VERSION` against ours, and:

- **versions match (or we're ahead):** runs the certified Tier-A subset as a
  hard gate;
- **reference is ahead:** emits a loud `::warning` ("an upgrade is needed") and
  runs the corpus informationally — so spec drift is always visible without
  blocking unrelated work.

As of this writing this port targets **v10**, matching the reference: the full
v8–v10 render model (deterministic blank-map `row,col` markers + plus-shaped max
marker, decoupled color-bar band order + the two fixed-slot bar markers,
fingerprint-edge cell colours, and the hybrid fingerprint blank fills) is
implemented for the ported subset. The remaining unported parsers are tracked in
[`CERTIFICATION.md`](CERTIFICATION.md).

## Releasing

**Versioning policy** (shared across the entviz family): the release **minor
tracks the entviz spec major** this port targets — `0.<spec-major>.x` means
"compliant with entviz spec v`<spec-major>`", so `0.7.x` ⇒ v7 and `0.10.x` ⇒
v10. A spec bump is a **`--minor`** release (cut it when you raise
`SPEC_VERSION` in `packages/core/src/entviz.ts`); `--patch` covers port-only
changes within a spec version. The script doesn't auto-derive the number, but it
**warns** if the new minor disagrees with `SPEC_VERSION`, and if the sibling
[entviz](https://github.com/dhh1128/entviz) reference is on a newer spec than
this port claims — so the version stays an honest spec badge.

Releases are cut by a maintainer with the human-run script (pushes to `main`
and tags are reserved for humans — agents must not run it). Same interface as
the sibling repos' `scripts/release.py`:

```sh
python scripts/release.py                 # patch bump (default)
python scripts/release.py -m "…"          # patch bump, custom message
python scripts/release.py --minor -m "…"  # minor bump (e.g. a spec bump)
python scripts/release.py --set 0.10.0    # set an explicit version
```

It guards (on `main`, clean, in sync with origin), warns on spec drift, runs the
tests, bumps **both** packages in lockstep (keeping `@entviz/react`'s pin on
`@entviz/core` exact), refreshes the lockfile, commits (signed off), and pushes a
`vX.Y.Z` tag. The tag triggers `.github/workflows/release.yml`, which re-verifies
the tag matches the manifest, runs the tests, and publishes to npm **via OIDC
trusted publishing** — no stored token — with provenance.

The first release published **`@entviz/core` only**; `@entviz/react` is held
back until core is proven (the workflow has a one-line spot to enable it, and it
would need its own trusted publisher registered on npm).

## License

[Apache License 2.0](LICENSE). See also [`NOTICE`](NOTICE).
