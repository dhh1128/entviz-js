# @entviz/core

[![npm (@entviz/core)](https://img.shields.io/npm/v/@entviz/core.svg?label=%40entviz%2Fcore)](https://www.npmjs.com/package/@entviz/core)
[![node-current (@entviz/core)](https://img.shields.io/node/v/@entviz/core)](https://www.npmjs.com/package/@entviz/core)
[![types included](https://img.shields.io/npm/types/@entviz/core)](https://www.npmjs.com/package/@entviz/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

TypeScript implementation of [**entviz**](https://github.com/dhh1128/entviz)
(spec **v10**) — turn a high-entropy value (cryptographic key, hash, signature,
UUID, blockchain address, post-quantum key, …) into a comparable SVG diagram so
a human can decide *at a glance* whether two values are the same or different.

Pure TypeScript, **zero runtime dependencies** beyond `node:crypto`. Runs under
Node's native type-stripping (Node ≥ 22.6) — the package ships source, no build
step. Certified against the shared entviz conformance corpus (Tier A render
model + Tier B canonical raster) for every input whose parser is ported.

## Install

```sh
npm install @entviz/core
```

## Usage

```ts
import { render } from "@entviz/core";

// render(value, options?) -> SVG string
const svg = render("550e8400-e29b-41d4-a716-446655440000");

const svg2 = render("0123456789abcdef0123456789abcdef", {
  targetAr: 2.0,    // target aspect ratio W/H (default 1.0)
  fontSizePt: 16,   // reference font size in points (default 12)
  note: "git",      // optional ≤10-char printable-ASCII caption (never hashed)
});
```

The returned string is a self-contained `<svg>` with a `viewBox` (so it scales
responsively) and `data-*` attributes describing every channel. Invalid input —
a bad note, an out-of-range font size or aspect ratio, or (for now) a
>512-bit value — throws.

Using React? See [`@entviz/react`](https://www.npmjs.com/package/@entviz/react)
for a thin `<Entviz value="…" />` wrapper.

## What it draws

Each entviz encodes its value in several redundant channels — verbatim **text**
cells (lossless for ≤512-bit inputs), a fingerprint-driven **surround pattern**,
**nucleus colours**, a **colour bar**, an **ellipse overlay**, **blank-cell**
positions, and **quartile** marks — so a one-character difference is obvious to a
casual glance while careful spot-checks stay possible. The algorithm and its
guarantees are defined in the [spec](https://github.com/dhh1128/entviz/blob/main/docs/spec.md).

## Conformance & scope

`SPEC_VERSION` is stamped on every render (`data-entviz-version`). Ported
parsers: hex, UUID (dashed/undashed), and the UTF-8→base64url fallback, plus the
note / font-size error handling. The blockchain / CESR / SSH / SWHID / gitoid /
LEI / snowflake / CID / ULID / base32 / bech32 / base58 / Ethereum-EIP-55
parsers and the >512-bit large-input branch are mechanical follow-ons; the
shared core is complete and corpus-proven. See
[`CERTIFICATION.md`](https://github.com/dhh1128/entviz-js/blob/main/CERTIFICATION.md).

## License

[Apache-2.0](./LICENSE). See also [`NOTICE`](./NOTICE).
