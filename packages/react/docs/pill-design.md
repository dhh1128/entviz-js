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
- The pill's **accessible label** is **"view visualization, {type}."** (There is no
  visible "View visualization" tooltip — the pointer cursor signals clickability and the
  hover tooltip previews the value; §3.5, §14.)

## 2. First principles (every decision below derives from these)

1. **Recognition ≠ verification.**
   - *Recognition* — "is this roughly the kind of thing I'm looking for?" A glance
     suffices. Low stakes.
   - *Verification* — "are these two values actually the same?" A glance is
     **never** sufficient (paper §2.3, §5.1). This is the security-bearing act.
   - **The pill affords *locate / expand / copy*. No equality decision can be
     made from it.** Verification physically routes through expansion to the full
     entviz, where the discrete channels live.
   - *Locate* is realized by the optional `onLocate` hook plus the in-popover
     **"Find other occurrences…"** action: a host-implemented, in-corpus
     recognition move ("where else does this value appear *here*?"), never an
     equality claim. Its verification sibling is `onCompare` (the
     reference-requiring compare flow); locate stays firmly on the recognition
     side of the seam.

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
┌──────────────────────────────┐
│  cesr key            ⋮   🔑  │   ← resting (kebab appears on hover/focus)
└──────────────────────────────┘
   │                    │    │
 type cue          copy menu  role icon (type)
 (icon/text)          (⋮)     (trailing, clickable)
   └──── click body / icon → expand ────┘
```

- **Leading cap** (left): **empty** in the default *wild* posture — the pill carries a
  constant badge no longer, and no value bits at all. Under a *corpus* posture with the
  icon channel opted in, it becomes the **value-derived colorbar** (a mini of the entviz's
  own colorbar), *absolutely positioned* so it never shifts the text baseline (§13).
- **Type cue** — `typeSignal` (default `autoCombo`): the value's type as a trailing **role
  icon** (`key` · `signature` · `digest` · `address` · `identifier` · `raw`), *plus* the
  parser-derived **type text** ("cesr key") only when there's no label/mnemonic — so a pill
  is never empty but never doubles up. Force `icon` / `text` / `none` as needed. The type
  is the trusted channel (spec label-strip); for a >512-bit input the text still carries the
  truncation marker.
- **Role icon** (trailing): a monochrome `currentColor` Lucide glyph. It shows the *type*
  the pill already discloses, never the value — **zero value-identity bits** — and is
  clickable (expands, like the body).
- **Copy menu** (kebab `⋮`): appears on hover/focus for pointer+keyboard users; the same
  actions are *always* present in the expanded view, so touch/AT users reach them there (§6).
- **Hover** previews the value (§14); **hover** and **focus** draw a configurable outline
  (`--entviz-pill-{hover,focus}-outline`). A host can also set a persistent `highlight` ring.
- **No note on the pill; no *short* value-char teaser** (§3.2, §3.3).

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

- **No SHORT truncated value chars inline** (`014d…b5e2`): an ~8-char head+tail
  teaser is both glanceable *and* grindable (a ~48-bit prefix collision is feasible),
  so it trains the prefix/suffix heuristic vanity-grinding defeats (threat-model
  T1/T6; paper §5.1). This is about a *short inline* teaser — **not** a full-value
  hover preview, which shows the whole identifier and is far too long to grind (§14).
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

- **Hover/focus signals only** — pointer cursor + subtle affordance; the tooltip
  **previews the value** (§14), not a "View visualization" hint (the cursor already
  signals clickability). It does **not** auto-pop the entviz (avoids accidental
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
| `typeSignal` | `"autoCombo" \| "icon" \| "text" \| "none"` | `"autoCombo"` | How the value's type shows: role **icon** + type **text** only when there's no label (`autoCombo`); just the icon; just the text; or neither. §3.1. |
| `corner` | `CornerToken` | `"round"` (capsule) | Explicit pill corner style — `round` · `sharp` · `leaf` (this.i `gk37dm5n`). No longer derived from type (the role icon carries that). §12. |
| `highlight` | `boolean` | `false` | Persistently mark the pill (e.g. 3 of 10) with a ring via `--entviz-pill-highlight` — distinct from the transient hover/focus outline. Host-driven, not value-derived. |
| `trust` | `TrustAssumption` | none | The value's **trust posture** (this.i `ujdwjtex`). Absent / `posture:"wild"` → all value-derived channels off (the maximum-safety default). `posture:"corpus"` opts a same-origin, already-trusted value set into the recognition channels it enables (`mnemonic`, `autoColor`, `icon`). **Never expose changing this to the end user.** See §13. |
| `maxWidth` | `number \| string` | none | Clip overflow; type yields first. |
| `className`, `style` | — | — | Applied to the **pill chrome**, not the entviz. |
| `locale` | `string` | auto (`navigator.languages`) | Override locale (§8). |
| `messages` | `Partial<Messages>` | — | Override/extend the catalog (§8). |
| `dir` | `"ltr" \| "rtl" \| "auto"` | inherit | RTL mirrors **chrome only** (§8). |
| `onExpand` | `() => void` | — | Notify host on expand. |
| `onCopy` | `(kind: CopyKind) => void` | — | Notify host on copy. |
| `onError` | `(message: string) => void` | — | As today, for a bad `value`/`note`. |
| `onLocate` | `() => void` | — | Opt into the in-popover **"Find other occurrences…"** action (§2.1). Fires when the user asks to locate this value's siblings in the host's corpus; the host reveals them. Recognition, never a verdict. Also emits a notify-only `locate` event on `onEvent`. |
| `showLocateAffordance` | `boolean` | `true` when `onLocate` set | Keep the `onLocate` hook but suppress the built-in button (host renders its own trigger). |

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
| Wild pill affords locate/expand/copy only; no equality decision | recognition ≠ verification (paper §2.3, §5.1) |
| No SHORT truncated value-char teaser inline | prefix/suffix grinding (threat-model T1/T6) — a full-value hover preview is not grindable (§14) |
| No value-derived visual in the WILD posture; leading cap empty | glance-equivalence; zero identity bits. The corpus posture opts in, gated (§13) |
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

## 12. Corner-shape (`gk37dm5n`)

An **explicit, optional** pill corner style set via the `corner` prop.

**History (and why it's now simple).** An earlier iteration derived the corner from the
value's *role* (a `role → corner` map, `resolveCorner`/`CornerMap`/`DEFAULT_CORNER_MAP`,
six shapes) so a scanner could tell categories apart by geometry. That channel is
**removed**: the **trailing role icon** carries the type cue far more legibly, and
per-type corner shapes read as arbitrary. What remains is a plain style knob.

- **Vocabulary** (`CORNER_TOKENS`): `round` (the default — a **capsule**, semicircle
  ends), `sharp` (square), `leaf` (rounded diagonal TL+BR, square TR+BL). All are
  per-corner `border-radius`, so the pill's 1px border stays intact on every edge.
- **Un-gated** by the trust posture — it's a cosmetic style, not value-derived.
- Themeable: `round` threads `--entviz-pill-radius`.

## 13. Trust posture & the corpus recognition channels (`ujdwjtex`)

entviz's pill is built for the **wild** posture — adversarial, zero identity bits, so
it can never be glance-compared. A host that owns a closed, single-origin, already-trusted
body of values (a **corpus** — e.g. a KERI KEL from the user's own machine) can opt that
set into **value-derived recognition channels** that make recurrence scannable.

- **The gate is a `TrustAssumption`** — a shareable, host-declared, v1-immutable object,
  passed via the `trust` prop. Provenance is per-**value**, not per-viewport: configure one
  assumption for a same-origin set, reference it from each of those pills; foreign entropy
  gets a different assumption (or none → wild). `resolveChannels(trust)` (core) is the pure
  gate: outside `posture:"corpus"`, **every** channel is off regardless of flags; within
  corpus, each channel is opt-in (default off).
- **Channel 1 — the auto-mnemonic (`mmtxrg4w`).** `mnemonic(cells, sizeBits)` (core) is built
  **only from the entviz's own displayed cells**, so it can never show a character the
  visualization doesn't (the key consistency rule — a base64url slice of the SHA-512 tail,
  the rejected v1, appears *nowhere* in the entviz). Shape scales with entropy: `< 256` bit →
  `first…last` (e.g. `550e84…00`); `≥ 256` bit → `first-two…middle…last` (e.g.
  `DKxy…19f2…imBx`), where a >512-bit input's middle is a genuine fingerprint-middle cell.
  The `…` is honest — the omitted middle cells are all present on expand. It fills the pill's
  label slot (in monospace) when enabled and no explicit `label` is set; explicit `label` wins.
- **Channel 2 — the auto-color tint (`tgowi7go`).** `autoColorIndex(value)` (core) hashes
  the value's fingerprint (its *last* byte — a different slice from the mnemonic's, so the
  channels are semi-independent) into a 16-hue `AUTO_COLOR_PALETTE`. The pill paints it as a
  **transparent** background tint (`autoTint`, react), so the host theme shows through and it
  reads on light *and* dark without a per-theme palette. 16 hues = 4 bits = a **soft
  pre-filter** ("the red ones"), never a partition — collisions are expected at scale.
- **Channel 3 — the colorbar icon (`wn3r6aex`).** Under corpus + `icon:true`, the pill's
  (otherwise empty) **leading cap** becomes a value-derived **mini of the entviz's own
  colorbar**: a **vertical** bar the same width the colorbar has in the visualization
  (`barWidth = 2·boxHeight` ≈ 1.25em), filling the pill height, bands stacked top→bottom at
  heights ∝ **count⁴** (the viz's dominance function, so one band usually dominates), with the
  two gutter markers as opaque **white discs + black halo** — exactly as the viz draws them
  (`colorbarIcon`, react; pure layout in `colorbarIconGeometry`). It's *absolutely positioned*
  so it never shifts the baseline. Because it draws the actual colorbar data, it's independent
  of the auto-color tint. In every other case (wild, or corpus without this channel) the
  leading cap is simply empty.
- **Recognition, never verification.** A matching mnemonic, tint, or icon is a
  *rule-out-not-rule-in* cue — two matching pills still route through Compare.

**Security — the posture is never an end-user affordance.** Trust is asserted by the party
that *knows* the provenance (the host, in code), not by the reader deciding whether to trust.
The pill therefore exposes **no** control to change its own posture — a "mark as trusted"
button would be a one-click false-reassurance vector. The only runtime elevation is **earned
promotion** (this.i `xlqpkhfy`, tick `~2lia`, v2): a value rises wild→trusting by the user
*completing a successful formal comparison*, never by a toggle.

## 14. Copy-on-selection & the hover value preview

Two affordances that make the value reachable without opening the pill — both
**un-gated** (they don't depend on the trust posture), because neither is the §3.3
short-prefix grinding vector.

- **Copy-on-selection (D).** The visible chrome (badge/icon, type, role, label/mnemonic,
  ⋮) is `user-select: none`; a hidden, `aria-hidden`, *selectable* span carries the raw
  value. So a text selection sweeping a paragraph that contains the pill contributes only
  the **value** to the clipboard — not the type/label/kebab glyphs. (Copying is fine in any
  posture; "Copy value" already exists.) The value now lives, hidden, in the DOM — a
  select-all grabs it, same exposure as Copy value; relevant only if `value` is secret.
- **Hover value preview (E).** The tooltip shows the value (first `VALUE_PREVIEW_CHARS`
  ≈ 72 chars, `…` beyond) — the full value for essentially every identifier. This is **not**
  §3.3's grinding vector: that targets a *short* (~8-char) glanceable, grindable teaser,
  whereas a 50–75 char prefix is the whole value for most inputs and a hundreds-of-bits
  prefix is computationally out of reach to grind. The old "View visualization" tooltip is
  gone — the pointer cursor already signals clickability. The accessible name is unchanged
  (`aria-label` = "view visualization, {type}").
