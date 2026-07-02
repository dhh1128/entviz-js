# Disclosure-lifecycle — affordance & feature parity checklist (lock gate)

**Date:** 2026-07-02
**Purpose:** Before locking the pill → look → compare disclosure-lifecycle design, this
enumerates every affordance/feature in the *current* @entviz/react suite and its status in
the prototype (`~/winhome/Downloads/entviz-lifecycle-prototype.html`). The build into the real
components must satisfy **every C/D/E row** — the prototype is a chrome/flow study and
deliberately stubs the machinery. Sources: `Entviz.ts`, `EntvizPill.ts`, `EntvizCompare.ts`,
`EntvizWalk.ts`, `EntvizVoiceCompare.ts`, `copy-actions.ts`, `pill-messages.ts`,
`compare-messages.ts` + the two design docs. Legend: ✓ present & correct · ~ stubbed (must
be truly implemented) · ✗ not in prototype (must be carried in from existing code).

---

## A. In the prototype & settled (the interaction design being locked)
- ✓ Pill → look → compare progression as **one object, three disclosure states**.
- ✓ Pill faithful to `EntvizPill.ts`: constant 2×2 gold/blue/black/red badge, type label,
  `padding-block:0`+`line-height:1` (compact), `vertical-align:middle` (centered in line),
  0.34em radius (blocky, not lozenge), hover/focus **kebab** carrying the copy menu.
- ✓ Grow-from-pill motion; teaching header (Seam 1); reference-slot-as-gate (Seam 2).
- ✓ Verdict sobriety: green `=` reserved for machine-identical; human affirmative is only
  "no difference found"; a flipped-char reference visibly moves every channel.
- ✓ Theme-agnostic: `font/color: inherit`, surfaces from `currentColor`, one accent var,
  overridable status colors → adapts to any host (4 host themes demoed).
- ✓ Responsive: panel `max-height:100dvh` + internal scroll; ≤560px stacks compare figures
  and wraps the toolbar (the design's `layout:"auto"`).
- ✓ Rail relabeled **Reference · Look · Compare** (was the incorrect "Recognize").

## B. Stubbed in the prototype — MUST be truly implemented in the build
- ~ **Reference acquisition, all four methods** (`EntvizCompare.ts`): **paste** (incl. a
  pasted raster image via clipboard), **file-pick** (`accept .svg,image/svg+xml,image/*`),
  **drag-drop** (files or text), **URL-fetch**. Prototype fakes these with two demo buttons.
- ~ **Origin-shown-before-fetch** (`fetchHint` "Will fetch from {origin}") + fetch error copy.
- ~ **Medium detection** `detectMedium` → text / svg / raster / ambiguous, and the three
  engines: `compareValues`, `compareComparisonText`, `compareSvg`, async `rasterCompare`.
- ~ **Copy/export actions actually working**: value · comparison text · image (2× PNG) · SVG
  (`copyEntviz`/`copy-actions.ts`). Prototype only toasts (and copies value).

## C. Not in the prototype — MUST be carried in from the existing `<Entviz>`/`<EntvizPill>`
- ✗ **Size ladder** (`FONT_SIZE_LADDER` 6…30), the −/＋ stepper, disabled at bounds.
- ✗ **Reshape / grid-shape picker** (`gridShapes`, thumbnails), `reshapable` flag (off for raster).
- ✗ **Controlled vs uncontrolled** fs/ar via `onResize`/`onReshape`; the comparator drives
  BOTH figures from shared `dispFs`/`dispAr`.
- ✗ **Full keyboard set**: Cmd/Ctrl+C (copy value), `+`/`-`/`0` (size up/down/reset), ArrowDown
  (open menu/popover), ArrowUp/Down/Home/End roving menu focus, Escape (close + focus return),
  Enter/Space (expand), ArrowLeft/Right (switch compare tabs).
- ✗ **Localization**: `SUPPORTED_LOCALES` (18 langs), full `Messages` + `CompareMessages`
  catalogs, `locale`/`messages` props, RTL (`dir`) mirrors **chrome only, never the glyph**;
  value/comparison-text/verdict are **never** localized.
- ✗ **Accessibility**: roles (img/dialog/menu/menuitem/status/tablist/tab/progressbar),
  `aria-live` toasts & prompts, focus move-in/return, and the **per-channel screen-reader
  description** of the expanded entviz (`describeChannels` → `desc`/`a11yDescription`).
- ✗ **Truncation marker** (>512-bit): red "fingerprint of" prefix on the type.
- ✗ **Secret-material warning** (`looksLikeSecret`): banner when value/reference looks like a
  private key / seed phrase.
- ✗ **Verdict state machine** (four states) + chip symbols/tones: pending `?`, identical `=`
  (green, machine-only), different `≠` (red), unknown ambiguous/raster/raster-similar; plus
  `role="status" aria-live`. Prototype shows only identical/different.
- ✗ **Provenance label**: pasted / file / {origin} / dropped / provided.
- ✗ **`confidence` prop** (quick/strong/paranoid) plumbing.
- ✗ **Callbacks**: `onExpand`, `onCopy`, `onError`, `onVerdict`, `onResize`, `onReshape`
  (+ new `onCompare` from the proposal).

## D. Whole surfaces absent from the prototype — preserve & integrate into the lifecycle
- ✗ **M2 guided walk** (`EntvizWalk.ts`): mode picker (spot-check vs complete; complete-only
  for ≤~6 cells); **coverage meter** = bit-weighted `progressbar` with Quick/Good ticks
  ("progress during a comparison"); **focus-ring overlay** (scrim + green ring, `externalFigures`
  path); per-feature prompts (text + gestalt dims); **planted probe** (complete only) with hover
  reveal; **re-look** confirmation; terminal verdicts (no-difference / different / inconclusive /
  pending-done); `onStep`/`onComplete`; recognition note.
- ✗ **M3 voice ceremony** (`EntvizVoiceCompare.ts`): affirmation gate; authenticator-directed
  **read-back by grid address** (row/col); two modes (voice-only, paste-bind); homoglyph
  extra-cell note; progress meter; terminal verdicts; one-way-auth framing.
- **Lifecycle integration point:** the compare surface exposes both as peer entries (the
  existing "Compare visualizations" vs "Compare by voice" tabs; machine vs walk via the
  spot-check/complete launch). The lock keeps these as distinct, deliberate acts — the walk
  and voice are *not* collapsed into the machine flow.

## E. Theming variable reconciliation (do NOT lose host-restyle surface)
- The prototype invented `--evz-*` names for the demo. The build MUST keep the **existing
  `--entviz-*` names** already shipped, and add lifecycle-chrome vars in the same namespace.
  Full existing set to preserve: `--entviz-ctl(-bg/-active)`, `--entviz-menu-*`,
  `--entviz-toast-*` (Entviz); `--entviz-pill-*` (gap/radius/bg/border/truncated/menu-*/
  popover-*/toast-*/error); `--entviz-compare-*` (good/bad/warn/neutral/action/placeholder(-fg)/
  input-border/warn-*); `--entviz-walk-*` (ring/scrim/btn(-bg)/track/meter/tick).

## F. Open naming decision
- Rail labels set to **Reference · Look · Compare** (default; user may swap stage-1 to avoid
  the "Reference" panel-word overlap, or stage-3 "Compare"→"Verify").

---

### Lock statement
Locking the **interaction design** (state model, seams, motion, pill anatomy, theme-agnostic
chrome, verdict sobriety, responsive behavior — sections A & F) does **not** drop any function:
B/C/D/E are the build's parity obligations, tracked here. Nothing in the current suite is
removed by this design — the machine compare, guided walk, and voice ceremony all survive as
deliberate, distinct acts reached through the same disclosure lifecycle.
