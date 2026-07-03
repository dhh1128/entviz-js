# `@entviz/react` — integration guide

React components that render a high-entropy value (a public key, hash, UUID,
address, CID, …) as an **entviz** — a comparable visual fingerprint — and help a
person decide whether two values are the same.

This guide is the developer-facing overview: components, props, the `onEvent`
firehose, theming, and the security contract you inherit by embedding these
components. For the exact generated type signatures see the TypeDoc API reference
(`npm run docs` at the repo root). For the *why* behind the design, see
[`pill-design.md`](./pill-design.md), [`comparison-design.md`](./comparison-design.md),
and the canonical [`../../../../entviz/docs/threat-model.md`](https://github.com/dhh1128/entviz/blob/main/docs/threat-model.md).

> **The one thing to internalize.** entviz protects a single judgment: *are these
> two values equal?* A green `=` verdict means **"equal to the reference you
> supplied"** — never "this reference is the one you should trust." Confidentiality
> of the value is **out of scope** (entviz is a comparison aid, not a secrecy
> primitive); values are assumed public. The components are hardened against a
> **tampering** threat — an attacker (or ambient CSS) trying to make two *different*
> values look the *same* — not against a value being observed.

---

## Install

```
npm install @entviz/react @entviz/core react
```

`@entviz/react` ships raw `.ts` authored with `React.createElement` (no JSX, no
build step required by consumers). It has one runtime dependency, `@entviz/core`
(isomorphic; no Node built-ins), and `react >= 17` as a peer.

---

## The components & the disclosure lifecycle

An entviz enters a page as a compact **pill**, opens to the full **visualization**,
and — deliberately — becomes a **comparison**. That arc is **Cite → Visualize →
Compare**, and it's one object revealing itself, not three widgets.

| Component | Role |
|---|---|
| `<Entviz>` | The spec-locked SVG render of one value (optionally with a size/shape/copy toolbar). |
| `<EntvizPill>` | The collapsed, inline form. Click to expand into `<Entviz>`; opt into an in-popover "Compare against another value…" that opens `<EntvizCompare>` in place. |
| `<EntvizCompare>` | The full comparison surface: acquire another value to compare against yours (paste / drop / click-to-upload / URL), get a machine verdict, or run the guided **walk** or the **voice ceremony**. |
| `<EntvizWalk>` / `<EntvizVoiceCompare>` | The guided single-user walk and the two-party voice ceremony. Usually reached *through* `<EntvizCompare>`; exported for direct use. |

```tsx
import { Entviz, EntvizPill, EntvizCompare } from "@entviz/react";

// 1. Just render one.
<Entviz value="550e8400-e29b-41d4-a716-446655440000" />

// 2. Inline pill that drills in (Visualize → Compare) when the host opts in.
<EntvizPill value={key} label="signing-key" onCompare={() => log("compare")} />

// 3. The comparison surface directly.
<EntvizCompare value={mine} onVerdict={(v) => log(v.state)} />
```

---

## Props

Shared render inputs on every component: **`value`** (required), `targetAr`,
`fontSizePt`, `note` (≤10 printable-ASCII chars, never hashed). Common chrome:
`className`, `style`, `locale`, `onEvent`. Only notable/component-specific props
are listed below; see TypeDoc for the full signatures.

### `<Entviz>`
| Prop | Type | Notes |
|---|---|---|
| `controls` | `boolean` | Show the size-ladder + shape picker + copy/export kebab beside the figure. |
| `reshapable` | `boolean` | Offer the shape picker (off for a raster reference). |
| `onResize` / `onReshape` | `(n) => void` | Fired on size/shape change; passing them makes size/shape *controlled*. |
| `title` | `string` | Accessible label (defaults to a channel description incl. the note). |
| `onError` | `(msg) => void` | Render failure (e.g. an invalid note). |

### `<EntvizPill>`
| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | First-party trusted text after the type (unlike the note). |
| `showType` / `showIcon` | `boolean` | The parser-derived type label / the constant 2×2 badge. |
| `dir` | `"ltr"\|"rtl"\|"auto"` | Chrome writing direction; the glyph is never mirrored. |
| `onExpand` / `onCompare` | `() => void` | Entered visualize / entered compare. Providing `onCompare` opts in the in-popover "Compare against another value…" affordance. |
| `showCompareAffordance` | `boolean` | Keep `onCompare` telemetry but hide the built-in button. |
| `open` / `onOpenChange` | `boolean` / `(open) => void` | **Controlled disclosure.** With `open` set, the popover follows it and actions report via `onOpenChange` (host owns state). Controlling `open` cannot skip the reference gate. |
| `onCopy` | `(kind) => void` | A copy/export action fired. |

### `<EntvizCompare>`
| Prop | Type | Notes |
|---|---|---|
| `reference` | `{ kind: "text"\|"svg"; data: string }` | A host-supplied value to compare against (renders directly; no acquisition UI). |
| `layout` | `"side-by-side"\|"stacked"\|"auto"` | Panel arrangement; `"auto"` stacks when narrow (mobile). |
| `onVerdict` | `(v: Verdict) => void` | Terminal machine verdict. |
| `allow` | `{ paste?; file?; url?; drop?: boolean }` | **Restrict-only, allowlist-closed.** Absent ⇒ all methods on. *Present* ⇒ a method is on only if its key is exactly `true` (so `{paste:true}` disables file/url/drop). Fails closed. |
| `fetchReference` | `(url, {origin, signal}) => Promise<{text}\|{blob}>` | Host fetcher (proxy/auth/CORS). Its bytes run the **same §6.2 gauntlet** as pasted bytes — it supplies bytes, never a verdict, and can't mark a reference identical. Origin is still shown before any fetch. |
| `includeContent` | `boolean` (default `false`) | When true, `reference.acquired` events carry the raw `content`. A convenience for logging (values are public); off by default only so a pasted-secret corner case isn't ambiently logged. |
| `rng` | `() => number` | Deterministic sampling for tests/demos. **Ignored in production** (see Security). |
| `messages` | `Partial<CompareMessages>` | Localize surrounding chrome. Verdict/scoping/provenance strings are **not** override-able (see Security). |

`<EntvizWalk>` / `<EntvizVoiceCompare>` add `mode`, `externalFigures`, `onStep`,
`onComplete`, and `rng`.

---

## Events — the `onEvent` firehose

Every component accepts `onEvent?: (e: EntvizEvent) => void` — one typed,
**notify-only** firehose that mirrors the whole lifecycle and comparison journey,
*in addition to* the specific callbacks (`onVerdict`, `onExpand`, …). Use it for
logging, telemetry, analytics, and custom affordances without forking.

```tsx
<EntvizCompare value={mine} onEvent={(e) => {
  // e.type is a discriminant; e.seq (monotonic), e.ts, e.source, e.sensitivity
  if (e.type === "verdict.change") analytics.track("entviz_verdict", { state: e.verdict, provenance: e.provenance });
  if (e.type === "fetch.error")   log.warn("reference fetch failed", e.origin, e.message);
}} />
```

`EntvizEvent` is a discriminated union (`type` + an object payload). The kinds:

| Stage | Event types |
|---|---|
| lifecycle | `render.error`, `disclosure.change`, `copy` |
| display | `display.resize`, `display.reshape`, `display.tab` |
| acquisition | `reference.acquired`, `reference.cleared`, `reference.mediumDetected`, `reference.readError`, `secret.detected` |
| fetch | `fetch.start`, `fetch.success`, `fetch.error` |
| outcome | `verdict.change` |
| verification | `walk.start`, `walk.step`, `walk.complete`, `voice.start`, `voice.complete` |

Every event carries `seq` (monotonic per instance), `ts`, `source`
(`"entviz"|"pill"|"compare"|"walk"|"voice"`), and a `sensitivity` **routing hint**
(`"plain"|"network"|"content"` — a hint for your logging, *not* a security
boundary). Three invariants are structural, not conventions:

- **`verdict.change` (and every verification event) is notify-only.** A host
  handler cannot veto, delay, or synthesize a verdict. Only **`fetch.start`** is
  advisory-cancelable — call its `preventDefault()` to block a fetch (fail-closed:
  it can only *deny* egress, never force a pass).
- **There is no `voice.step`, and no `*.step` fires during a live ceremony.** The
  live authenticator-selected cell order must never leave the endpoint (it would
  let a remote party pre-position). `walk.step` (single-user machine walk only)
  carries a feature *kind* + index, never glyphs.
- **A throwing `onEvent` can't wedge the component** — the call is wrapped; a bug
  in your handler never skips a safety or breaks rendering.

---

## Theming

The components ship **no fonts and no color scheme of their own.** They inherit
the host's `font-family` and `color`, derive surfaces from `currentColor`, and
expose `--entviz-*` CSS custom properties for the rest — so the same component
looks native in a light SaaS, a dark dashboard, a serif site, etc. Set the vars on
any ancestor:

```css
.my-app {
  --entviz-compare-action: #2f6bff;      /* accent for buttons/tabs */
  --entviz-pill-popover-bg: #1a1f2b;     /* dark popover surface */
  /* …see TypeDoc / source for the full --entviz-* set */
}
```

> **Security note — some colors are deliberately NOT themeable.** The **verdict
> chip color + its `=`/`≠` symbol** and the **walk focus ring/scrim** are fixed
> literals, *not* driven by `--entviz-*` vars. This is by design: an attacker who
> controls ambient CSS (threat-model tier T2) must not be able to set
> `--entviz-compare-bad: green` and repaint a "Different" verdict, or set the walk
> ring transparent and erase the attention spotlight. Everything else (menus, pill
> chrome, radii, action accents) is freely themeable.

---

## The security contract you inherit

Embedding these components, you get these guarantees against a **false-"same"**
attacker (and you should not try to defeat them):

- **The verdict is authoritative.** `=`/green appears only for a machine
  `identical`. You **cannot** relabel a verdict via `messages` (the verdict,
  scoping, and provenance strings are pinned), recolor it via CSS vars (fixed
  literals), or force/suppress it via `onEvent` (notify-only).
- **A green `=` is scoped.** The "equal to THIS reference, not that it's
  trustworthy" caveat renders on the machine chip too — including under controlled
  `open`. Reference **provenance** is always shown.
- **Sampling stays unpredictable.** An injected `rng` is **ignored in production**
  (`NODE_ENV==='production'` → platform CSPRNG), so a predictable check order can't
  be shipped to let an attacker pre-forge the sampled cells.
- **Fetched/injected reference bytes are untrusted.** A `fetchReference` result and
  any URL-fetched body run the same closed-profile → recompute → re-render →
  self-consistency gauntlet as pasted bytes; a host fetcher can't hand back a
  pre-blessed `identical`.
- **Acquisition can be locked down** (`allow`, allowlist-closed) for host DLP/policy
  — e.g. disable URL-fetch. Note: generic SSRF from your own `fetchReference` is
  *your app's* responsibility, outside entviz's asset frame.

What's explicitly **out of scope**: confidentiality of the value (assume it's
public — event payloads may carry it), clipboard/paste tampering, and defending a
user who chooses not to look.

---

## Localization

Pass `locale` (a BCP-47 tag; 18 locales ship, English fallback) and/or `messages`
to localize chrome. RTL locales mirror the chrome, never the glyph. The **value,
comparison text, and verdict semantics are never localized or case-folded** — they
are exact codepoints, and the verdict strings are not host-override-able.

---

## See also

- [`pill-design.md`](./pill-design.md) — the collapsed form + copy affordances.
- [`comparison-design.md`](./comparison-design.md) — the comparison surface, the
  verdict machine, the guided walk (§14) and voice ceremony (§15).
- `../../reviews/integration-surface/proposal-2026-07-02-v2.md` — the events/props
  design rationale and its adversarial security review.
- The entviz **spec** and **threat model** live in the sister `entviz` repo.
