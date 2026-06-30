# `<EntvizPill>` — collapsed-form & copy/paste affordances (design)

**Status:** design, pre-implementation. **Audience:** implementers of `@entviz/react`.
**Depends on:** the entviz spec (`../entviz/docs/spec.md`), threat model
(`threat-model.md`), and paper (`entviz-paper.md`) in the sister repo. Section
references below are to those documents.

This doc designs a **collapsed, inline form** of an entviz — a *pill* — plus the
**copy/paste** affordances, for both the pill and the expanded view. It does
**not** design the comparison protocol UI (the seeded two-party walk of paper
§5.2); that is deferred. It also does not design the future in-container
controls (font-size / aspect-ratio); it only reserves the architecture for them.

---

## 1. Terminology (use it precisely)

- An **entviz** is the *visualization*. It is **not** a "fingerprint."
- The **fingerprint** is an internal construct (SHA-512 of the normalized text)
  that drives most channels. Never expose the word "fingerprint" in UI chrome.
- User-facing verb is **"View visualization."** Accessible label is
  **"view visualization, {type}."**

## 2. First principles (every decision below derives from these)

1. **Recognition ≠ verification.**
   - *Recognition* — "is this roughly the kind of thing I'm looking for?" A glance
     suffices. Low stakes.
   - *Verification* — "are these two values actually the same?" A glance is
     **never** sufficient (paper §2.3, §5.1). This is the security-bearing act.
   - **The pill affords *locate / expand / copy*. No equality decision can be
     made from it.** Verification physically routes through expansion to the full
     entviz, where the discrete channels live.

2. **The entviz is a closed, unmodified artifact** (spec *Closed profile*). The
   profile forbids *any* overlaid content — no logo, caption, watermark, or
   chrome drawn on the diagram. Therefore **all** pill/expand chrome lives
   **outside** the entviz SVG. The display is a **container**: it MUST contain an
   unmodified entviz, and MAY add chrome *around/below* it (never on top). See
   §7 (Container model).

3. **The entviz is context-free; the chrome is contextual.** The entviz is
   deterministic — identical output on every platform, no font inheritance, no
   light/dark adaptation, fixed palette and its own monospace fallback chain
   (spec *Determinism*, *Font-family fallback chain*). The pill/container chrome
   **does** inherit the running font and adapt to light/dark. This split is the
   API boundary (§5).

4. **Type is trusted; the note is not.** The parser-derived **type** rides the
   *trusted top label channel* (spec, label-strip step). The **note** is a
   self-declared, out-of-band caption the spec deliberately renders as *quiet
   gray chrome in the bottom strip, off the trusted channel* to bound a
   human-false-reassurance risk (threat-model *User note*). The pill respects
   that hierarchy — see §3.2.

## 3. The collapsed form (the pill)

An inline, interactive chip that represents an entviz without rendering it, and
expands on demand.

### 3.1 Anatomy

```
┌────────────────────────────┐
│ �859 hex·256             ⋮  │   ← resting (kebab appears on hover/focus)
└────────────────────────────┘
   │   │                    │
 badge type             copy menu (Fork A-c: pointer/kb only at rest)
(const)(trusted)
   └──── click body → expand ────┘
```

- **Badge** (left): a **constant** 2×2 of the entviz palette — gold `#e7be00`
  and blue `#2f3fbf` on the top row, black `#000000` and red `#ff3f2f` on the
  bottom (the two dark cells split across rows so it doesn't read bottom-heavy) —
  with a hairline border so black reads on dark and gold reads on light. It is **the
  same on every entviz** — a *type badge* meaning "this is an entviz, color
  hiding beneath," carrying **zero identity bits**, so it can never be
  glance-compared for verification. Toggle with `showIcon` (default `true`).
- **Type** text: the parser-derived category (`hex·256`, `UUID`, `BTC address`,
  …) — the trusted channel. For a >512-bit input it carries the spec's
  truncation marker + real byte length (e.g. `fingerprint-of hex(2048)`), so a
  collapsed glance already tells you the text channel is truncated.
- **No note. No value characters. No value-derived visual.** (§3.2, §3.3.)
- **Copy menu** (kebab `⋮`): **Fork A-(c)** — appears on hover/focus for
  pointer+keyboard users (keeps the resting inline pill minimal); the same
  actions are *always* present in the expanded view, so touch/AT users reach them
  there. See §6.

### 3.2 Why no note on the pill

The note's only collapsed value is *instance disambiguation among same-type
pills*, and surfacing it costs more than it buys:

- It would **undo the spec's deliberate de-emphasis** (quiet gray, bottom strip,
  off the trusted label) on the most glanced-at surface there is, re-amplifying
  the exact false-reassurance vector the threat model works to bound.
- It is **self-declared** — set by whoever rendered the entviz, possibly not the
  reading party.
- Nothing is lost: the note still renders **inside** the expanded entviz at its
  spec-prescribed quietness; and a first-party host that wants an instance label
  renders **its own trusted label beside the pill**, in its own trust context.

So **two same-type pills are intentionally identical until expanded.** Refusing
to let you tell them apart collapsed is the secure behaviour, not a gap:
instance-level recognition would require either the note (false-reassurance) or a
value-derived visual (glance-equivalence) — both rejected.

### 3.3 Why no value characters and no value-derived visual

- **No truncated value chars** (`014d…b5e2`): this trains the prefix/suffix
  heuristic that vanity-grinding attacks defeat (threat-model T1/T6; paper §5.1).
- **No single color / color-bar crop**: a lossy projection of identity invites
  glance-equivalence. A *constant* badge (zero identity bits) does not.

### 3.4 Inline behaviour

- `display: inline-flex; vertical-align: baseline; white-space: nowrap`. It flows
  with running text (`gh secret save [pill]`), sizes in `em`, won't break
  internally; the line may break before/after it.
- The chrome text uses `font: inherit` and `currentColor`, so it matches the
  surrounding type and adapts to light/dark.
- **`maxWidth`** clips overflow; the **type yields/truncates first** (it is
  always recoverable on expand and in the tooltip).

### 3.5 Interaction

- **Hover/focus signals only** — cursor + subtle affordance + tooltip
  *"View visualization"*. It does **not** auto-pop the entviz (avoids accidental
  triggers while reading; respects touch/AT; viewing takes intent).
- **Click / Enter / Space → expand** (Fork B: expand is the default primary
  action). A host whose context is "use this value" rather than "verify it" may
  later opt into click→copy-value via a prop; not in v1.

## 4. The expanded view

**It is the entviz itself + copy actions. Nothing is reinvented.** The entviz
already contains, by spec: the **type** (+ stripped prefix) in the top strip; the
**bound suffix** and the **note** in the bottom strip; and the **value** as the
cell text (lossless ≤512-bit; head/middle/tail + `fingerprint of` marker for
>512). So the expanded view does **not** add a value field, and does **not**
duplicate the type/note labels.

- **Form factor:** a **non-modal**, viewport-aware popover anchored to the pill
  (doesn't reflow the paragraph), dismissed on Escape / click-outside. Non-modal
  on purpose — the deferred comparison work wants two open side-by-side, which a
  modal forbids.
- **Contents:** the unmodified entviz at a readable size + the copy actions
  (§6). The full raw value is reachable only via **Copy value** (it is *not*
  displayed — for ≤512 the cells already show it; for >512 it is intentionally
  not human-read in full).
- **Focus:** moves into the popover on open, returns to the pill on close.

## 5. Property split (the closed profile *is* the boundary)

Two disjoint groups. **Entviz props are render inputs to the closed, deterministic
document; pill props are contextual chrome.**

### 5.1 Entviz render inputs (deterministic, context-free — do NOT adapt to font/theme)

| Prop | Type | Default | Notes |
|---|---|---|---|
| `value` | `string` | — (required) | The entropy. |
| `targetAr` | `number` | `1.0` | Target aspect ratio W/H. |
| `fontSizePt` | `number` | `12` | Reference font size, pts (spec range `[6,30]`). |
| `note` | `string \| null` | `null` | Out-of-band caption (spec: ≤10 printable-ASCII). Rendered **inside** the entviz's bottom strip per spec; **never shown on the pill** (§3.2). |

These pass straight through to the existing `<Entviz>` renderer. Identical on
every platform; no theme/font adaptation.

### 5.2 Pill / container chrome (contextual — inherits font, adapts to light/dark)

| Prop | Type | Default | Notes |
|---|---|---|---|
| `showIcon` | `boolean` | `true` | Render the constant badge. |
| `maxWidth` | `number \| string` | none | Clip overflow; type yields first. |
| `className`, `style` | — | — | Applied to the **pill chrome**, not the entviz. |
| `locale` | `string` | auto (`navigator.languages`) | Override locale (§8). |
| `messages` | `Partial<Messages>` | — | Override/extend the catalog (§8). |
| `dir` | `"ltr" \| "rtl" \| "auto"` | inherit | RTL mirrors **chrome only** (§8). |
| `onExpand` | `() => void` | — | Notify host on expand. |
| `onCopy` | `(kind: CopyKind) => void` | — | Notify host on copy. |
| `onError` | `(message: string) => void` | — | As today, for a bad `value`/`note`. |

Theming via CSS custom properties (e.g. `--entviz-pill-radius`,
`--entviz-pill-gap`, `--entviz-badge-border`), so hosts restyle without forking.

> **Component shape.** Keep the existing pure renderer `<Entviz>` (a `role="img"`
> span wrapping the closed SVG). Add `<EntvizPill>` — the interactive collapsed
> form — which composes `<Entviz>` for its expanded view. `<EntvizPill>` accepts
> both prop groups above.

## 6. Copy actions

Each action **confirms what it copied and in what format** (a transient status,
announced via `aria-live="polite"`). The ambiguity we defend against is "did I
get the value, the picture, or the comparison text?"

| Action | Copies | Format / notes |
|---|---|---|
| **Copy value** | the value **as supplied** (`value` prop) | The literal string the holder has — round-trips to this entviz, the thing you'd paste into a system. Confirm with length: *"Copied value · 64 hex chars."* Two case-variants of a case-insensitive value yield the same entviz but different `value` — correct; this copies the literal value, not the identity. |
| **Copy comparison text** | the **cell texts**, in grid **reading order** (L→R, top→bottom), **case-exact** | The faithful read-aloud comparison surface (spec *Guarantees*; paper §5.3). **Space-separated** within reading order; **blank-cell separators preserved** so head/middle/tail stay segmented for large inputs. Unicode-precise: the stored token **codepoints** (the *normalized* cell text the entviz shows), never an OCR of glyphs. Confirm: *"Copied comparison text · N cells."* |
| **Copy image (PNG)** | rasterized entviz | The universal paste target (chat/email/issues). |
| **Copy SVG** | the entviz SVG | Scalable/embeddable; dev/designer use. |

**Value vs. comparison text are different strings by design** (raw supplied value
vs. normalized cell texts) and are kept distinct by **name + format** — never
adjacent-and-interchangeable. "Copy value" is for *using* the value; "Copy
comparison text" is for *verifying* it by reading aloud.

> **Settled (was deferred):** comparison-text **content** = the cell texts and
> **order** = the grid reading order — both fixed by the spec. What remains
> deferred is the comparison *protocol UI* (the seeded walk), not this artifact.

**Paste** is the inverse build path (paste a value → render), as in the
playground; in a host, the "create" path.

**Secret handling:** entviz mostly targets public identifiers, but `value` can be
secret. The component never auto-copies, never persists `value`, and keeps every
copy user-initiated. Auto-clear/timeout is host policy, not the component's.

## 7. Container model (extension point — reserved, not designed)

The expanded view is a **container** with one hard contract: it **contains an
unmodified, closed-profile entviz**. Around/below that entviz it may host chrome —
today the copy actions; **eventually** in-container controls (font size, aspect
ratio, channel toggles per spec *Thoughts About Comparing*). Rules:

- Controls live **outside** the entviz SVG (below it), **never overlaid** — an
  overlay would violate the closed profile.
- A control that changes an **entviz render input** (font size, AR) re-renders a
  **new** closed entviz from the new inputs; it does not mutate an existing SVG.
- The entviz remains context-free; the controls are contextual chrome.

This keeps "the artifact" and "the tools around the artifact" cleanly separated,
which is the same boundary as §5.

## 8. Localization

The localizable surface is small: **menu labels, the hover tooltip, copy
confirmations, and aria-labels.** Ship a built-in catalog with **English
fallback**; auto-detect via `navigator.languages`; allow `locale`/`messages`
overrides (hosts often manage locale centrally).

**Two non-negotiables, both security-relevant:**

1. **Never localize or transform the copied `value` or comparison text.** They are
   exact codepoints, case-exact, locale-independent. And **never use
   locale-aware case operations on the value** anywhere — the Turkish dotless-`i`
   (`"I".toLowerCase()` under `tr`) would corrupt normalization, the fingerprint,
   and comparison. Use locale-invariant casing only. (Spec: case normalization is
   per-alphabet and load-bearing.)
2. **RTL mirrors the chrome, not the entviz.** Hebrew/Arabic flip the pill layout
   (badge right, menu left) via `dir="rtl"`. The **entviz never mirrors** — cell
   reading order is L→R top→bottom by spec, and mirroring would corrupt
   comparison. Chrome is contextual; the artifact is fixed.

**Do not localize the type labels** in v1 — `hex`, `UUID`, `base64url`, chain
names are technical identifiers; a mistranslation could mislead about *what kind*
of value it is. Localize the *actions*, keep the *identifiers* canonical.

**Message catalog shape (sketch):**

```ts
interface Messages {
  view: string;              // "View visualization"
  ariaView: string;          // "view visualization, {type}"
  copyValue: string;         // "Copy value"
  copyComparison: string;    // "Copy comparison text"
  copyImage: string;         // "Copy image"
  copySvg: string;           // "Copy SVG"
  copiedValue: string;       // "Copied value · {n} {unit}"
  copiedComparison: string;  // "Copied comparison text · {n} cells"
  copiedImage: string;       // "Copied image"
  copiedSvg: string;         // "Copied SVG"
}
```

**Locale targets.** Confirmed: `fr`, `es` (prefer `es-419` + `es-ES`), `de`,
`pt` (prefer **`pt-BR`** + `pt-PT`), `it`, `ru`, `el`, `he`, `ar`, and the CJK
set split properly — **`zh-Hans`** *and* **`zh-Hant`** (Simplified vs Traditional
are distinct), `ja`, `ko`. **Add for market reach:** `hi` (India), `id`,
**`tr`** (Turkish — and shipping it forces the casing landmine above into the
open), and consider `vi`. English is the fallback for any unmatched tag.

## 9. Accessibility contract

- **Pill** = a `<button>` (Enter/Space → expand); `aria-label` =
  *"view visualization, {type}"* (localized; no note — what's shown is what's
  announced, §3.2). Tooltip on hover **and** focus.
- **Copy menu** = a `<button aria-haspopup="menu" aria-expanded>` opening a
  `role="menu"` (arrow-key nav, Escape, focus return).
- **Copy confirmations** announced via `aria-live="polite"`.
- **Expanded entviz** = `role="img"` with the visualization label, **and** its
  accessible description exposes the **discrete, color-independent channels**
  (cell text in reading order, color-bar letters, quartile orientations, marker
  positions) so a screen-reader user can read/verify. *Accessibility is the same
  problem as security* (paper §5.4): the text channel is the highest-capacity,
  color-independent channel, so the screen-reader read-aloud **is** the
  verification path — AT users get parity, not a degraded glance.

## 10. Security rationale (one-line index)

| Decision | Grounding |
|---|---|
| Pill affords locate/expand/copy only; no equality decision | recognition ≠ verification (paper §2.3, §5.1) |
| No truncated value chars | prefix/suffix grinding (threat-model T1/T6) |
| No value-derived visual; constant badge | glance-equivalence; zero identity bits |
| No note on the pill | bound false-reassurance vector (threat-model *User note*) |
| Type on the trusted channel | spec label-strip (top = trusted) |
| Entviz unmodified, chrome external/below | spec *Closed profile* |
| Comparison text = cells, reading order, case-exact | spec *Guarantees*; paper §5.3 |
| Never locale-transform value; locale-invariant casing | spec case-normalization; Turkish-`i` |
| Expose discrete channels to AT | paper §5.4 |

## 11. Deferred (explicitly out of scope here)

- The **comparison protocol UI** — the seeded, committed two-party walk (paper
  §5.2) and the casual/adversarial mode guidance (§5).
- In-container **controls** (font size, AR, channel toggles) — architecture
  reserved in §7, not designed.
- An opt-in **click→copy-value** primary action for "use this value" hosts (§3.5).
