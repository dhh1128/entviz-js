# Accessibility & Responsive Review: entviz-js (@entviz/react)

**Date:** 2026-07-11
**Effort level:** deep
**Implementation commit:** 82f81ff11948b2e891ff9ec3acc38a2095764212 (main, v0.15.0)
**Context sources used:**
- Components read in full: `packages/react/src/Entviz.ts`, `EntvizPill.ts`, `EntvizCompare.ts`, `EntvizWalk.ts`, `EntvizVoiceCompare.ts`, `text-scale.ts`, `pill-messages.ts`, `compare-messages.ts`
- Design docs: `packages/react/docs/pill-design.md`, `packages/react/docs/comparison-design.md`
- Playground: `apps/playground/src/App.tsx`
- Reviewed source only (no running browser). Items marked SPECULATIVE need manual verification.

---

## Evidence Inventory

**Components traced:**

- `EntvizPill` — full trace: pill button, kebab menu, popover (role="dialog"), rail navigation, compare/visualize lifecycle, Escape handler, focus-return-on-close, a11y description, toast live region. Focus-on-popover-open logic checked exhaustively.
- `Entviz` (controls path) — size ladder group, shape picker menu, copy kebab menu, keyboard shortcut handler, tabIndex=0 wrapper, toast live region.
- `EntvizCompare` — tablist/tab pattern, acquisition textarea, verdict chip (role="status"), secret-warning alert, guided-walk launch, fetch-error alert. Panel layout for `layout="auto"` inside the pill popover traced through `layoutStyle()`.
- `EntvizWalk` — coverage meter (role="progressbar"), mode picker, step flow, relook controls, `ringOverlay()` SVG overlay, `probePanel()` including the `onMouseEnter` reveal.
- `EntvizVoiceCompare` — affirmation gate, per-cell read-back, relook flow.
- `placeFloater()` — full math traced for 320px-wide viewport and OSK-shrunk heights.

**Static analysis — what needs live-browser verification:**

- Focus-trap absence in the popover (keyboard Tab escape path) — CONFIRMED by code inspection: no Tab trap exists; manual VoiceOver + keyboard verification would confirm the SR announcement path.
- Visible focus rings on non-kebab buttons inside the popover — UA default outlines only; depends on the host's CSS reset.
- Forced-colors (Windows High Contrast) behavior of inline SVG `fill`/`stroke` attributes — static analysis identifies the risk; only an OS-level test can confirm.
- The `progressbar` accessible-name announcement — confirmed absent in code; SR behavior is speculative.

---

## Executive Summary

A keyboard-only user and a screen-reader user can reach and activate every control: all interactive elements are real `<button>` elements with accessible names, ARIA menus implement arrow-key navigation with Home/End/Escape, and the `a11yDescription` bridge (§9) provides a genuine non-visual equivalent of the entviz render. The product's most visible accessibility gap is that **the pill popover does not move focus into itself when it opens**, leaving keyboard users stranded at the pill button while the popover is live — a violation of the WAI-ARIA dialog pattern that also means screen-reader users may not discover that a dialog appeared. A secondary concern is that **neither the popover nor any background content is marked `aria-hidden` or `aria-modal` while the dialog is open**, so a screen reader can wander freely into the page behind it. On responsive behavior the implementation is thoughtful: the `layout="auto"` mode wraps correctly, `maxWidth: min(720px, calc(100vw - 24px))` keeps the popover inside the viewport on narrow screens, and `placeFloater()` clamps both axes. The close button's 22×22px touch target is the single responsive gap (WCAG 2.5.5 recommends 44×44px).

---

## Accessibility Findings

### Keyboard operability and focus management

**Every interactive element is keyboard-accessible.** All buttons are `<button type="button">` with explicit `aria-label`s. The pill button carries `aria-expanded`, the kebab carries `aria-haspopup="menu"` and `aria-expanded`, and the ARIA menu pattern (ArrowDown/ArrowUp/Home/End/Escape with focus-to-first-item on open, focus-to-trigger on Escape) is correctly implemented for both the kebab menu and the Entviz toolbar menus.

**Focus on popover open — CONFIRMED GAP.** When `isOpen` becomes `true`, the popover is rendered via `createPortal` but no `useEffect` moves focus into it. The only focus-on-open effect in `EntvizPill.ts` (lines 375-382) targets the *menu*, not the popover. The Escape handler at line 353 returns focus to `pillRef.current` correctly on close — but focus was never moved in, so the return-focus path is irrelevant for users who never had focus inside the popover. A keyboard user who activates the pill button sees the popover open but their focus cursor stays on the pill; Tab navigates into the next element in the page's DOM order, not into the popover. The popover has `role="dialog"` which creates a strong AT expectation that focus will land inside. The design doc (pill-design.md §4) explicitly states "Focus: moves into the popover on open, returns to the pill on close" — so this is a known contract that has not been implemented.

**No focus trap.** While the design explicitly calls the popover "non-modal" (pill-design.md §4: "non-modal on purpose — the deferred comparison work wants two open side-by-side"), the absence of both a focus trap AND `aria-modal` means a screen-reader user tabbing through the popover will exit into the background page without being informed they have left the dialog. For a sighted user this is fine (two popovers side by side); for a SR user, it breaks the ability to understand what surface they are on.

**No `aria-modal` on the dialog.** WCAG 4.1.2 and the ARIA dialog spec both expect that a `role="dialog"` element carries `aria-modal="true"` if background elements are not made `inert`/`aria-hidden`, so the screen reader knows not to roam the background. Without it, on many screen readers (especially NVDA+Chrome) the virtual cursor can exit the popover and read background content.

**Visible focus — partially implemented.** The `PILL_CSS` injected into `<head>` covers the kebab button with `.entviz-pill__kebab:focus-visible { opacity: 0.7; }` — but no corresponding rule exists for the popover's close button (✕), the rail step buttons (Compare/Visualize navigation), or the menu items and toolbar buttons inside the popover. Those elements rely on the browser UA default `:focus` ring or the host's CSS reset. A host that does `* { outline: none }` (common in React apps with custom design systems) will silently eliminate keyboard focus indicators for those controls. The close button is particularly exposed because it sits in a fixed-position overlay and hosts often reset outlines globally.

**Tab order within the popover.** The close button is rendered first in the portal (line 650), before the rail and the visualization body. This means keyboard Tab from the trigger would land on the close button first if focus were moved in — which is reasonable. The rail step buttons are in reading order after the viz content; no positive `tabIndex` values found.

**EntvizWalk mode picker and controls** — all `<button>` elements, all keyboard-operable. The relook confirmation buttons are correctly implemented as a linear choice pair.

### Screen-reader semantics

**The a11yDescription bridge (§9) is implemented correctly.** When the popover is open and the value renders without error, a visually-hidden `<span id={descId}>` contains the full channel description (type + cells + color-bar letters + quartile cell addresses + blank-map extremes + bar-marker positions), and the dialog's `aria-describedby={descId}` links to it. A screen reader that honors `aria-describedby` will announce this when the user focuses the dialog — giving full parity with the visual channel. This is the most important a11y feature in the library, and it works.

**Accessible names on every control — CONFIRMED.** The pill button has `aria-label={ariaLabel}` (line 542) derived from `m.ariaView` + the type token. The kebab has `aria-label={m.actions}`. The popover close button has `aria-label={m.close ?? "Close"}`. Rail step buttons that are interactive have `aria-label` set (the Compare button uses `m.compareAction`; the Visualize back-button explicitly sets `ariaLabel: undefined` — it uses its visible text instead). Menu items have visible text labels. The file input has `aria-label={m.pickFile}`. No missing accessible names found.

**Menus/dialogs — mostly correct, one gap.** `role="menu"` with `aria-label`, `aria-haspopup="menu"`, and `aria-expanded` on triggers are all present. The popover carries `role="dialog"` and `aria-label`. Missing: `aria-modal="true"` on the popover (noted above).

**Tab widget in EntvizCompare — incomplete pattern.** The `role="tablist"` container and `role="tab"` buttons with `aria-selected` are present. However: the tab panels (the reference tab body and the voice tab body) have no `role="tabpanel"`, and the `<button role="tab">` elements carry no `aria-controls` pointing to their corresponding panels. This means a screen reader using the WAI-ARIA tab pattern cannot jump from tab to panel via keyboard, and the active panel is not announced as associated with the active tab. This is a real gap, though lower-stakes than the popover focus issue because the content is visible and reachable by Tab.

**Live regions — present and correct.** The toast announcements use `aria-live="polite"` with a visually-hidden span (lines 675, 297 in Entviz.ts). Fetch errors use `role="alert"` (EntvizCompare line ~643). The secret-key warning uses `role="alert"` (line 822). The verdict chip uses `role="status"` with `aria-live="polite"` (line ~722). The voice-compare per-cell instruction uses `aria-live="polite"` (EntvizVoiceCompare line 228). The walk's live-verdict text uses `aria-live="polite"` (EntvizWalk line 372). No silent status updates found.

**Coverage progressbar — missing accessible name.** The `role="progressbar"` in `EntvizWalk` (line 422) carries `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`, but no `aria-label` or `aria-labelledby`. WCAG 1.3.1 and the progressbar role require an accessible name. Without it, a screen reader announces only the numeric percentage; the user does not know the bar measures walk coverage.

**Entviz base render — `role="img"` with label.** The figure span carries `role="img"` and either the host-supplied `title` or the default label (`"entviz visualization, note <note>"` / `"entviz visualization"`). The label is meaningful and includes the note when present. The render-error fallback uses `"entviz (render error)"` — informative. No issues.

**Entviz controls wrapper — `tabIndex=0` on a bare `<div>`.** When `controls` is true, the outer wrapper gets `tabIndex={0}` and an `onKeyDown` handler for keyboard shortcuts (+/-/0/Ctrl+C). This makes the div a keyboard stop — but the div has no `role` to communicate to a screen reader what kind of interactive widget it is. A screen reader landing on it hears only the element's contents read in sequence, with no cue that +/- shortcut keys are available. This is SPECULATIVE (depends on whether a SR encounters the div before the inner buttons).

### Perceivable-by-all (contrast, motion, non-color cues)

**`prefers-reduced-motion` — partial.** The pill popover grow animation is handled: `PILL_CSS` includes `@media (prefers-reduced-motion: reduce) { .entviz-pill__pop { animation-duration: 1ms; } }`. However, `EntvizWalk.ts` line 477 defines `meterFill` with `transition: "width .15s"` for the coverage bar fill, with no corresponding reduced-motion override. This is a CSS-in-JS inline style, not a class, so a host-level `prefers-reduced-motion` reset will not reach it. The transition is short (150ms) and a progress bar, so the severity is LOW, but it is technically non-conformant with WCAG 2.3.3 (AAA) and violates the spirit of WCAG 2.3 (AA-adjacent in many contexts).

**`prefers-contrast` / forced-colors.** No `@media (forced-colors)` overrides exist anywhere in the package. The main concerns:

- `EntvizWalk` `ringOverlay()` uses SVG `fill` and `stroke` attributes for the scrim (`#000`) and focus ring (`#39ff14`). In forced-colors (Windows High Contrast) mode, SVG fill/stroke colors set via attributes are replaced by the system palette — typically the ring becomes `Highlight` or `ButtonText` and the scrim becomes `Canvas`. The ring will likely survive, but the specific bright-lime guaranteeing visibility (§7.1) cannot be assumed. The comment at line 90 ("bright focus ring — load-bearing verification cue") is not wrong, but forced-colors changes the guarantee.
- `EntvizWalk` verdict colors (`#1a7f37` green for "no difference", `#c4314b` red for "different") are inline style `color` values. In forced-colors mode these are replaced by `ButtonText`/`GrayText`, collapsing the color distinction. This is mitigated because the verdict is also conveyed by text (the full verdict string changes) — color is a redundant cue, not the only one. LOW severity.
- `EntvizWalk` `btnBad` has `borderColor: "#c4314b"` and `color: "#c4314b"` — the red "Looks different" / "Yes, different" button uses color as a secondary cue (border + text color). Under forced-colors, these collapse to the system default; the button label still conveys the action. LOW severity.

**Color is not the only channel — confirmed for verdicts.** In `EntvizCompare`, the verdict chip always carries a symbol (= / ≠ / ? / ≈ / ↻) AND a text label, so a colorblind user gets the verdict from the symbol/text, not color alone. The walk's "Matches" vs "Looks different" buttons are distinguished by text and border-color — the text distinction is the primary cue.

---

## Responsive / Cross-surface Findings

### Touch affordances

**The kebab reveal is mouse/hover-only at rest.** `PILL_CSS` reveals the kebab on `.entviz-pill--hover` (set by `onMouseEnter`/`onMouseLeave` on the wrapper) and on `:focus-visible`. A touch user who taps the pill does NOT trigger `onMouseEnter`, so the kebab never becomes visible. On touch devices, the pill button occupies the entire body and opens the popover; the kebab — which offers Copy, View, etc. — is not reachable without triggering a mouse event. The design doc (pill-design.md §3.1) explicitly acknowledges this as "Fork A-c: pointer/kb only at rest — the same actions are always present in the expanded view." So the touch fallback is intentional: all copy actions are available inside the popover. This is documented and accepted, not a defect.

**Close button touch target: 22×22px.** The popover's explicit close button (`popCloseStyle`) is `width: 22; height: 22`. WCAG 2.5.5 (AAA) recommends 44×44px; WCAG 2.5.8 (AA, WCAG 2.2) requires at least 24×24px. At 22×22px the close button fails the emerging WCAG 2.5.8 minimum. Enlarging the touch target — either by increasing the element size or by adding a transparent `::after` pseudo-element — resolves this without changing the visual appearance.

**Walk and compare button sizes.** The walk action buttons (`btn` style) use `padding: "6px 12px"` with `font: "inherit"` and `fontSize: TEXT.body` (= 1em). At a default 16px host font, this yields approximately 12+12+2×6=36px height — below the 44px recommendation but above the 24px minimum. Acceptable at most host font sizes; borderline at small host fonts (≤10px).

### Small viewports

**Popover responsive — well-handled.** `popoverStyle` uses `maxWidth: "min(720px, calc(100vw - 24px))"` and `maxHeight: "calc(100dvh - 24px)"` with `overflowY: "auto"`. At 320px viewport: outer container = 296px, fits without horizontal scroll. The pill inside the popover uses `EntvizCompare` with `layout: "auto"` (line 630), which maps to `display: flex; flexWrap: wrap` — the two comparison panels wrap to stacked when the 296px container cannot fit both 200px-minimum panels side-by-side.

**`placeFloater` — analyzed, no overflow.** The horizontal clamping (`left = Math.max(pad, Math.min(left, viewport.width - f.width - pad))`) ensures the popover stays within viewport width at any viewport. The menu's `minWidth: 210` is safely inside a 320px viewport (210 + 2×8 = 226 < 320). Vertical placement uses `Math.max(pad, a.top - f.height - gap)` as a floor, capping the top at 8px from the viewport top; the `maxHeight: calc(100dvh - 24px)` prevents overflow below. OSK-shrunk heights are handled because `useFloating` listens on `scroll` and `resize` events.

**VoiceCompare and Walk fixed 460/420px max-widths.** `EntvizVoiceCompare.ts` line 186 uses `maxWidth: 460` as an inline style on the affirmation-gate container. Inside the pill popover (which is capped at `calc(100vw - 24px)`), this 460px is never a constraint on a ≤484px viewport — the outer popover clamps it first. On a standalone `EntvizVoiceCompare` outside the pill, a 420px host container would clip this. The `hint` and `prompt` styles also use `maxWidth: 460` and `420` respectively — these are max-widths, not min-widths, so they do not force overflow; they just allow the text to run wider than desirable on narrow screens. SPECULATIVE because behavior depends on host container width.

**`side-by-side` layout with `flexWrap: nowrap`.** When a host uses `<EntvizCompare layout="side-by-side">` directly (not through the pill), and each panel has `minWidth: 200`, two panels plus a 16px gap = 416px minimum. On a 375px mobile viewport, this causes horizontal overflow unless the host constrains the comparator's own width. `layout="auto"` (the default in the pill) wraps; `layout="side-by-side"` does not. The prop documentation should warn about this.

**The `EntvizVoiceCompare` uses `flexWrap: "wrap"` on the figure+readout layout** (line 251), which correctly wraps to stacked on small screens. The `figureBox` (position: relative, inline-block) plus the `readout` column is a good pattern.

---

## Top Findings

### F1: Pill popover does not move focus on open, violating the ARIA dialog contract

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizPill.ts` — no `useEffect([isOpen])` that calls `.focus()` on popover open; contrast with lines 375-382 (correct focus-on-open for the *menu*)
- **Who is blocked and on which flow:** Keyboard-only users who activate the pill and expect Tab to navigate inside the popover; screen-reader users who expect NVDA/JAWS to switch virtual-cursor context to the dialog. The `a11yDescription` bridge (§9) is unreachable by a keyboard user unless they navigate backward through the DOM — and the bridge is the *only* way a blind user gets the visualization content.
- **Design doc contract:** pill-design.md §4: "Focus: moves into the popover on open, returns to the pill on close." The return-focus-on-close is already implemented (line 353: `pillRef.current?.focus()`); the move-focus-on-open is not.
- **Recommendation:** Add a `useEffect` that fires when `isOpen` transitions to `true` and moves focus to the first focusable element inside the popover. The close button is the natural initial focus target (it is the first child, it is always present, it is visible). After adding: `useEffect(() => { if (isOpen) { const id = requestAnimationFrame(() => popFloat.ref.current?.querySelector<HTMLElement>('button')?.focus()); return () => cancelAnimationFrame(id); } }, [isOpen])`. Also add `aria-modal="true"` to the popover's `role="dialog"` span — this is discussed in F2 below.

---

### F2: Popover `role="dialog"` lacks `aria-modal="true"`, allowing SR virtual cursor to escape into the background page

- **Severity:** HIGH
- **Confidence:** LIKELY
- **Location:** `packages/react/src/EntvizPill.ts:638-658` (the popover `h("span", { role: "dialog", ... })`)
- **Who is blocked and on which flow:** Screen-reader users on NVDA+Chrome or JAWS, where the virtual buffer reads background elements as if they are part of the active context when `aria-modal` is absent from a dialog. A user tabbing through the "visualize" popover may wander into the host page's other links/buttons/headings without knowing they left the dialog.
- **Design intent vs ARIA spec:** The design explicitly says the popover is "non-modal on purpose" (two open side-by-side). This is a valid product decision. But "non-modal" in the product sense (no background scroll-lock, no backdrop, two can coexist) does not mean "no `aria-modal`" — `aria-modal="true"` is how you tell a screen reader "don't read the background behind this dialog", which is equally important for a non-blocking dialog as for a blocking one. Without it, screen readers on some combinations see the background content as part of the dialog.
- **Recommendation:** Add `aria-modal="true"` to the popover span. This does NOT require a focus trap and does NOT prevent two popovers from being open simultaneously — it only prevents the screen reader virtual cursor from roaming into the background while the popover has focus. If the product decides to leave this absent (to support SR navigation of the background), document the decision explicitly.

---

### F3: `EntvizCompare` tab widget is incomplete — panels lack `role="tabpanel"` and tabs lack `aria-controls`

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizCompare.ts:780-824`
- **Who is blocked and on which flow:** Screen-reader users navigating the "Compare by reference" vs "Compare by voice" tab strip cannot jump from the active tab to its panel using the keyboard shortcut (typically Space/Enter + Tab in browse mode), and the content area is not announced as the currently-active tab's panel. NVDA in browse mode will still reach the content by Tab, but the semantic relationship is broken.
- **Finding:** The `tabButton` function creates `<button role="tab" aria-selected={...}>` inside a `<div role="tablist">`. The content that follows (either `referenceTab` or `voiceTab`) is a plain `<div>` with no `role="tabpanel"`. The tabs have no `aria-controls` pointing to their panels. The panels have no `aria-labelledby` pointing back to their tabs. The WAI-ARIA tab pattern requires: tab has `aria-controls="panel-id"`; panel has `role="tabpanel"`, `id="panel-id"`, and `aria-labelledby="tab-id"`.
- **Recommendation:** Assign stable `id`s to both panels (using `useId()`), add `role="tabpanel"` and `aria-labelledby` to the panel wrappers, and add `aria-controls` to the tab buttons. Fix effort is small — all the state is already present, it just needs the ID wiring.

---

### F4: Walk coverage `progressbar` has no accessible name; the `meterFill` CSS transition ignores `prefers-reduced-motion`

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizWalk.ts:422` (progressbar); line 477 (meterFill transition)
- **Who is blocked and on which flow:** (a) A screen reader user who encounters the coverage bar hears only "22 percent" (or whatever value) with no context that this measures walk coverage. Under WCAG 1.3.1 an accessible name is required. (b) A user with vestibular disorder who has `prefers-reduced-motion: reduce` active will still see the bar animate its width change on every step — there is no override for inline-style transitions, which a host-level `* { transition: none }` would normally suppress.
- **Recommendation:** (a) Add `aria-label="Coverage"` (or the locale-appropriate string, if the walk surface gets localized) to the progressbar div. (b) Wrap the `meterFill` transition in a CSS custom-property that defaults to the transition but is overridden by a `@media (prefers-reduced-motion: reduce)` rule injected via the same `useInjectStyles` pattern used by the pill. Alternatively, query `window.matchMedia("(prefers-reduced-motion: reduce)")` in the component and conditionally omit the `transition` from the inline style.

---

### F5: Close button touch target is 22×22px, below the WCAG 2.5.8 minimum of 24×24px

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/react/src/EntvizPill.ts:761-766` (`popCloseStyle`)
- **Who is blocked and on which flow:** Touch users on mobile — the primary device class for casual, inline-pill encounters — who cannot reliably tap the ✕ close button on a 22×22px target. WCAG 2.5.8 (Success Criterion added in WCAG 2.2, Level AA) sets a 24×24px minimum. The WCAG 2.5.5 target of 44×44px remains the recommendation.
- **Recommendation:** Increase the close button to `width: 28; height: 28` (visually small but safe) or use a larger clickable area with a CSS `::after` pseudo-element (`content: ""; position: absolute; inset: -8px; border-radius: 50%`). For a React.createElement-based codebase the inline-style approach is to add `padding: 3` to the existing 22×22 element (making the total interactive area 28×28), since the `borderRadius` already clips the visual square and the extra padding does not change the appearance within the pill's padding context.

---

## Additional Barriers Noted (below threshold)

- **`Entviz` controls wrapper `tabIndex=0` div with no `role`:** When `controls=true`, the outer `<div tabIndex={0}>` receives keyboard focus between the `<span role="img">` figure and the toolbar buttons below it. Screen readers may announce it as a "section" or a "generic" — which gives no cue that keyboard shortcuts (+/-/0/Ctrl+C) are available. Adding `role="group"` and `aria-label="Visualization controls"` would make the keyboard stop meaningful. LOW.

- **EntvizWalk mode-picker strong heading has no level:** `h("strong", null, M.title)` renders "Verify by walking the cells" as bold text with no semantic heading role. If the walk is embedded in a deeply-nested section, the heading hierarchy is interrupted. Using `role="heading" aria-level="3"` (or adjusting to context) would help. LOW.

- **EntvizVoiceCompare ended verdict has `role="status"` (polite):** The walk ended verdict uses `role="status"`, which is `aria-live="polite"`. A high-stakes verdict ("Different — what they read does not match your value.") might warrant `role="alert"` (`aria-live="assertive"`) to interrupt the current screen reader speech and announce the result immediately. The current polite announcement can be delayed or missed if the SR is mid-sentence. SPECULATIVE (SR vendor behavior varies). LOW.

- **Walk per-step prompt uses `aria-live="polite"` — may need to be `assertive`:** `h("span", { "aria-live": "polite", ... }, promptFor(step))` on line 384. Each time the step changes, the new prompt is announced politely. If a user activates a button and the step updates in the same event loop turn, the button-activation feedback and the new step prompt may interleave. Rare in practice; SPECULATIVE. LOW.

- **`m.close ?? "Close"` English fallback in popover close button:** The `close` message key is `optional` in the `Messages` interface; when missing from a locale catalog it falls back to the English string "Close". This is a localization concern shared with L10N, but the a11y angle is that the button's accessible name may be in the wrong language for a non-English screen reader user. Using a required key with a locale-appropriate default would resolve both concerns. LOW.

---

## What's Done Well

- **The a11yDescription bridge (§9) is a genuine win.** Discrete, color-independent channels — cell text in reading order, color-bar letter sequence, quartile cell addresses, blank-map extremes, bar-marker positions — are rendered as visually-hidden text referenced by `aria-describedby` on the dialog. This gives a blind user complete parity with the visual channel and turns the screen-reader read-aloud into the verification path. It is thoughtfully implemented and localized across 16 locales.

- **All controls are real `<button>` elements with explicit `aria-label`s.** No bare `<div onClick>` interactive elements found. The ARIA menu pattern (haspopup, expanded, arrow-key nav, Escape, focus-return) is correctly implemented for both the pill kebab and the Entviz toolbar menus.

- **Focus return on Escape is implemented.** The Escape handler at EntvizPill line 353 returns focus to `pillRef.current` (the pill button that opened the popover). This is the right behavior when the popover closes.

- **Toast live regions are correctly implemented.** Both `aria-live="polite"` visually-hidden spans (for copy confirmations) and `role="alert"` spans (for fetch errors, secret key warnings) are used appropriately throughout.

- **`prefers-reduced-motion` is handled for the popover grow animation** (the most prominent animation in the library) via the `PILL_CSS` injection pattern.

- **Responsive popover width and height are well-designed.** `maxWidth: min(720px, calc(100vw - 24px))` and `maxHeight: calc(100dvh - 24px)` with `overflowY: auto` keep the popover inside any viewport. `placeFloater()` clamps both horizontal and vertical placement correctly, and the floating position is recalculated on both resize and scroll. `layout="auto"` wraps the comparison panels on narrow screens.

- **Direction/RTL awareness** is thorough: the popover, menu, and wrapper all inherit `dir={dirAttr}`, and the layout uses `insetInlineEnd` for the close button (RTL-correct) rather than `right`.

---

## Residual Unknowns (needs live verification)

| Unknown | Manual check |
|---|---|
| Focus management when popover opens — do any browser or AT heuristics auto-focus the dialog? | VoiceOver + Safari; NVDA + Firefox and Chrome: activate pill with keyboard, listen for context shift without code change |
| `aria-modal` absence — which SR+browser combos allow virtual cursor to escape into background? | NVDA + Chrome (most affected); VoiceOver + Safari (less affected); JAWS + Edge |
| Close button UA `:focus` outline — does the host's CSS reset eliminate it? | Navigate to popover close button via keyboard in the playground with `* { outline: none }` applied |
| Forced-colors: ring overlay in EntvizWalk — does `#39ff14` become `Highlight` or disappear entirely? | Windows 11 High Contrast mode + any browser — confirm focus ring is visible and distinguishable from the scrim |
| Forced-colors: verdict chip `background`/`color` inline styles — do they survive high contrast? | Same OS setup — confirm =/≠ symbol + text remain readable |
| Walk progressbar accessible name — how does NVDA announce it with no `aria-label`? | NVDA + Chrome: navigate to walk coverage bar, confirm announcement is intelligible |
| `layout="side-by-side"` horizontal overflow on ≤375px host — does the host clip or does a scrollbar appear? | Safari mobile or BrowserStack 375px viewport with a standalone `<EntvizCompare layout="side-by-side">` |

---

## Findings Manifest

```yaml
findings:
  - id: A11Y-F1
    persona: frontend-a11y-responsive
    title: Pill popover does not move focus on open, violating the ARIA dialog contract
    severity: HIGH
    confidence: CONFIRMED
    location: packages/react/src/EntvizPill.ts:375-382
    dedupe_key: entviz-pill-untrappable-for-sr
    recommended_disposition: recommend-fix
    rationale: >
      Keyboard and SR users cannot reach the popover content (including the
      a11yDescription bridge) without manually navigating backward through the DOM
      after the popover opens. The design doc (pill-design.md §4) explicitly contracts
      focus-on-open; the return-focus-on-close is already implemented.
    revisit_condition: null
    fix_effort: small

  - id: A11Y-F2
    persona: frontend-a11y-responsive
    title: Popover dialog lacks aria-modal, allowing SR virtual cursor to escape into background
    severity: HIGH
    confidence: LIKELY
    location: packages/react/src/EntvizPill.ts:638-658
    dedupe_key: popover-inaccessible-for-sr
    recommended_disposition: recommend-fix
    rationale: >
      Without aria-modal="true" on the role="dialog" span, NVDA+Chrome and JAWS enter
      background content via virtual-cursor navigation while the popover is open. The
      fix does not require a focus trap and is compatible with the non-modal product design.
    revisit_condition: null
    fix_effort: small

  - id: A11Y-F3
    persona: frontend-a11y-responsive
    title: EntvizCompare tab widget incomplete — no tabpanel role, no aria-controls
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/EntvizCompare.ts:780-824
    dedupe_key: entviz-compare-inaccessible-for-sr
    recommended_disposition: recommend-fix
    rationale: >
      The reference / voice tab strip uses role="tab" + role="tablist" but the content
      panels have no role="tabpanel", tabs have no aria-controls, and panels have no
      aria-labelledby. Screen readers cannot traverse the tab → panel relationship.
    revisit_condition: null
    fix_effort: small

  - id: A11Y-F4
    persona: frontend-a11y-responsive
    title: Walk coverage progressbar has no accessible name; meterFill transition ignores prefers-reduced-motion
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/EntvizWalk.ts:422,477
    dedupe_key: entviz-walk-inaccessible-for-sr
    recommended_disposition: recommend-fix
    rationale: >
      WCAG 1.3.1 requires an accessible name on the progressbar; without it SR users
      hear only the percentage. Separately, the 150ms CSS transition on the meter fill
      is an inline style that bypasses host prefers-reduced-motion resets, affecting
      users with vestibular disorders.
    revisit_condition: null
    fix_effort: small

  - id: A11Y-F5
    persona: frontend-a11y-responsive
    title: Popover close button is 22×22px, below WCAG 2.5.8 minimum touch target
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/EntvizPill.ts:761-766
    dedupe_key: popover-unresponsive-on-mobile
    recommended_disposition: recommend-fix
    rationale: >
      The ✕ close button is the only explicit way to dismiss the pill popover on mobile
      (Escape and outside-click are not reliable touch gestures). At 22×22px it is below
      the WCAG 2.5.8 (AA, WCAG 2.2) minimum of 24×24px and well below the WCAG 2.5.5
      recommendation of 44×44px. Touch users will frequently mis-tap.
    revisit_condition: null
    fix_effort: small
```
