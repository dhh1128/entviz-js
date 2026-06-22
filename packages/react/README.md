# @entviz/react

[![npm (@entviz/react)](https://img.shields.io/npm/v/@entviz/react.svg?label=%40entviz%2Freact)](https://www.npmjs.com/package/@entviz/react)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

A thin React component over [`@entviz/core`](https://www.npmjs.com/package/@entviz/core):
drop a comparable SVG fingerprint of any high-entropy value into a web or mobile
UI. See the [entviz](https://github.com/dhh1128/entviz) project for what an
entviz is and why.

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

### Props

| Prop | Type | Description |
|---|---|---|
| `value` | `string` | The high-entropy value to visualize (required). |
| `targetAr` | `number` | Target aspect ratio W/H (default `1.0`). |
| `fontSizePt` | `number` | Reference font size in points (default `12`). |
| `note` | `string \| null` | Optional ≤10-char printable-ASCII caption (never hashed). |
| `className`, `style` | — | Applied to the wrapping `<span>`. |
| `title` | `string` | Accessible label (`aria-label`). |
| `onError` | `(message: string) => void` | Called if rendering throws. |

## License

[Apache-2.0](./LICENSE). See also [`NOTICE`](./NOTICE).
