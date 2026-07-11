# @entviz/react

[![npm (@entviz/react)](https://img.shields.io/npm/v/@entviz/react.svg?label=%40entviz%2Freact)](https://www.npmjs.com/package/@entviz/react)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

React components over [`@entviz/core`](https://www.npmjs.com/package/@entviz/core):
drop a comparable SVG fingerprint of any high-entropy value (key, hash, UUID,
address, DID, …) into a web or mobile UI. See the
[entviz project](https://github.com/dhh1128/entviz) for what an entviz is, why
it exists, and the algorithm spec.

The components, the playground, and this package's source live in the
[`entviz-js`](https://github.com/dhh1128/entviz-js) repo.

## Install

```sh
npm install @entviz/react @entviz/core react
```

## Usage

```tsx
import { Entviz } from "@entviz/react";

function KeyBadge({ value }: { value: string }) {
  return (
    <Entviz
      value={value}
      targetAr={1.5}
      fontSizePt={14}
      note="git"
      title="signing key fingerprint"
      style={{ width: 240 }}
      onError={(msg) => console.warn("entviz:", msg)}
    />
  );
}
```

The component renders the entviz inline inside a `role="img"` `<span>`. The SVG
is produced entirely by the certified core renderer (which escapes all text and
embeds no caller markup) and carries a `viewBox`, so it scales to the wrapping
element's width. If rendering throws (e.g. an invalid `note`), `onError` is
called and an empty labelled `<span>` is rendered instead.

### `<Entviz />` props

| Prop | Type | Description |
|---|---|---|
| `value` | `string` | The high-entropy value to visualize (required). |
| `targetAr` | `number` | Target aspect ratio W/H (default `1.0`). |
| `fontSizePt` | `number` | Reference font size in points (default `12`). |
| `note` | `string \| null` | Optional ≤10-char printable-ASCII caption (never hashed). |
| `className`, `style` | — | Applied to the wrapping `<span>`. |
| `title` | `string` | Accessible label (`aria-label`). |
| `controls` | `boolean` | Show opt-in size + reshape controls beside the figure (default `false`). |
| `onError` | `(message: string) => void` | Called if rendering throws. |

## Components

The package exports five components. `Entviz` is the primitive render; the other
four are higher-level flows built on it. All ship as raw `.ts` source authored
with `React.createElement`, so they carry no JSX-transform requirement onto
consumers. Because the package publishes `.ts` (not compiled JS), bundlers that
skip `node_modules` from TypeScript transpilation (webpack, Next.js) must be told
to include `@entviz/*` — see [Bundler configuration](./docs/integration.md#bundler-configuration-these-packages-ship-raw-typescript).

| Component | What it does |
|---|---|
| `Entviz` | Renders a single high-entropy value as an entviz SVG — the thin, deterministic primitive the others build on. |
| `EntvizPill` | The collapsed, inline "pill" form: a constant badge plus the parser-derived type, with a copy menu and an expand-to-popover affordance. It consumes the structured characterization from the core renderer (not a label string), and deliberately never shows the note, value characters, or any value-derived visual — it affords locate / expand / copy, never an equality decision. |
| `EntvizCompare` | Helps a human decide whether *their* value matches a *reference*, by comparing two entviz visualizations side by side. The reference is acquired by paste / file-pick / drag-drop / URL-fetch and always re-rendered through the pinned font (a pasted SVG is never embedded). |
| `EntvizWalk` | The guided human walk: the user is walked one feature at a time, with a focus ring drawn around the feature on both figures, reporting Matches / Differs — including a transparent planted probe. Yields "no difference found", never a bare `identical`. |
| `EntvizVoiceCompare` | The remote two-party voice ceremony: one-way authentication on a single device, where the other party reads highlighted glyphs aloud over a trusted voice/video call and the authenticator reports Matches / Doesn't-match cell by cell. |

Each component's TypeScript prop types are documented in the
[API reference](https://dhh1128.github.io/entviz-js/api/).

## Try it live

- Hosted playground: **<https://dhh1128.github.io/entviz-js/>** — paste a
  high-entropy value, hit **Build**, and tweak the props (`targetAr`,
  `fontSizePt`, `note`, display width) live.
- Run it locally from the repo root:

  ```sh
  npm install
  npm run dev -w @entviz/playground
  # → http://localhost:5173
  ```

## Docs

- **Developer Integration Guide** —
  <https://dhh1128.github.io/entviz/integration-guide/> (how to adopt entviz in
  your app; what an entviz is and why).
- **API reference** — <https://dhh1128.github.io/entviz-js/api/> (TypeDoc for
  `@entviz/core` and `@entviz/react`).

> This README is what npm renders on the package page, so it re-publishes with
> the next version bump — that's fine.

## License

[Apache-2.0](./LICENSE). See also [`NOTICE`](./NOTICE).
