# Integration-surface security adversary — attack on the threat-model-corrected proposal (v2)

**Date:** 2026-07-02
**Role:** Integration-surface security adversary (`prompts/integration-security-adversary.md`, corrected frame).
**Target:** `reviews/integration-surface/proposal-2026-07-02-v2.md` (the DevX designer's v2), esp. its ⚑ §5.1–5.11 handoff.
**Frame:** `../entviz/docs/threat-model.md`. ONE primary asset = **the user's belief that two values are equal (or not)**; the win = a **false "same"** (`A ≠ B` read as equal). Secondary asset = **embedded-SVG integrity** (no silent alteration / no script-style bleed). **Confidentiality is OUT OF SCOPE** — no exfil/logger findings here. Key lens = **T2** (attacker controls surrounding CSS / fonts / scale on the embedding page).
**Commit examined:** `d9180a4397760f5db97b0105aad565c1e813bb01` (branch `main`).
**Code verified (not inferred):** `EntvizCompare.ts` (`TONE` :193–198, `chipFor` :162–181, verdict chip :465–473, `messages` merge :202, provenance render :455–457, `provided` origin `""` :250, `onFetch` :311–320), `EntvizWalk.ts` (`RING`/`SCRIM` :73–74, `ringOverlay` :89–119, `csprng` :403), `EntvizVoiceCompare.ts` (`rng` default :127, `onStep`→address :137–144/:192–193), `compare-messages.ts` (catalog incl. `identical`/`different`/`unknownReason`/`recognitionNote`/`provenance*`), `Entviz.ts:41–51`, core `raster-compare.ts:162` (never `identical`).

---

## 1. Executive summary

**Safe to build as-is? NO.** The event firehose is genuinely near-harmless under the corrected frame (values are public; observation doesn't distort). But the designer's own headline — "the danger is any **knob**" — is correct and **under-mitigated**: nearly every integrity guard the designer proposes in §5 is described as *aspirational* ("I will pin…", "must be removed from the catalog…") while the **shipping code does the opposite**. The proposal is a to-do list of guards, not a set of guards; the adversary's job is to confirm each is currently a hole and demand the guard be a **build-blocking, tested invariant**, not a design intention.

**Single most dangerous item:** **§5.1 / the `TONE` map (`EntvizCompare.ts:193–198`).** The verdict chip's color AND its symbol are painted in the *same* ancestor-overridable variable (`color: TONE[chip.tone]`, `:468`), so a T2 stylesheet setting `--entviz-compare-bad: #1a7f37` repaints a `≠ Different` chip in verdict-green **including the `≠` glyph** — defeating even the "hard-coded symbol is the backstop" argument. This is a one-line ambient-CSS false-"same". It exists **today**, before any new prop ships.

**Verdict counts (13 §5-items + props/events):**
- **REJECT (ship-blocking as proposed): 4** — §5.1, §5.3, §5.5, §5.7.
- **NEEDS-GUARD (accept only with a named, tested guard): 6** — §5.2, §5.4, §5.6, §5.11, `messages` prop, `rng` prop.
- **SAFE (as framed): 5** — §5.8, §5.9, §5.10, `onEvent` firehose, `fetchReference` (bytes-not-verdict).
- Plus **4 integrity vectors the designer did NOT flag** (V-1…V-4 in §5), one of which (V-1, `recognitionNote`/`provenance*` are override-able catalog keys) directly falsifies the "structurally non-suppressible" claims of §5.2/§5.3.

The REJECTs are not "the design is wrong" — the design *intent* is right. They are REJECT-until-the-guard-is-real, because in every case the current code is exploitable and the proposal offers a sentence of intention where it needs a fixed color / a removed catalog key / a suppressed event / a compile-time test.

---

## 2. Per-item verdicts

Ranked by realistic-harm × how-silent. Each: asset · tier · win · concrete attack · contract § · required mitigation.

### The events (firehose) — SAFE, with two exceptions folded into §5.5 and V-3

| Event | Verdict | Why |
|---|---|---|
| `render.error`, `disclosure.change`, `copy`, `display.tab`, `reference.*`, `fetch.*`, `verdict.change`, `walk.start/complete`, `voice.start/complete` | **SAFE** | Values are public; observation doesn't distort the glyph, desync the pair, or move the verdict. `verdict.change` being notify-only (no `preventDefault`) is the load-bearing property and it holds (§5.9). |
| `walk.step` | **NEEDS-GUARD** | Fine as feature-*kind*+index for the single-user machine walk, BUT the guard "suppressed while a live ceremony is active" must be a **test**, not prose — see §5.5. |
| `voice.step` (omitted) | **SAFE / correct** | Correctly does not exist. But the *existing* `EntvizVoiceCompare.onStep` still leaks the address — see §5.5 / V-3. |
| `secret.detected` | **SAFE** | Under the corrected frame this defends a non-asset; keeping it as a non-cancelable UX hint is harmless. Do not let its presence imply a confidentiality guarantee (copy already hedges). |

### The props

| Prop | Verdict | Attack (T2 unless noted) · contract | Required mitigation |
|---|---|---|---|
| `onEvent` | **SAFE** | Try/catch wrap is the only real requirement (a throwing handler must not wedge a safety). | Ship the try/catch + a test that a throwing `onEvent` does not skip `onVerdict`/verdict render. |
| `messages` | **NEEDS-GUARD → REJECT if unsplit** | `chipFor` reads `m.identical`/`m.different`/`m.pending`/`m.unknownReason` (`:165–178`); `{...defaults, ...overrides}` (`:202`) has NO filter. Host/"translation pack" relabels `≠ Different` → `= "Match"`. Also `recognitionNote`, `provenanceProvided`, `provenanceUrl` are override-able (V-1). Violates comparison-design §3/§14.6 ("reserve `=`/green for machine-IDENTICAL"). | Move `identical`/`different`/`pending`/`unknownReason`/`recognitionNote`/`provenance*` into a **frozen internal catalog** the `messages` prop cannot reach. Test: overriding any of those keys is a no-op. |
| `className`/`style` | **NEEDS-GUARD** | Host `style` cascades `transform: scaleX()`/`filter`/`mix-blend-mode` onto a `figureBox` → desync/overlay (§5.6/§5.11). `Entviz.ts:41–51` closed profile. | Apply only to the chrome root; wrap each figure in an isolation boundary (`isolation:isolate`, `contain`, explicit reset of inherited `transform`/`filter` on `figureBox`). Test: a host `transform` on the root does not reach either figure. |
| `data-*`/`aria-*`/`id` passthrough | **SAFE (allowlist) / REJECT if blocklist** | Allowlist `^(data-[a-z0-9-]+|aria-[a-z]+|id|role|title)$`, string values, chrome-root only. A blocklist fails open on the next attribute (`transform`, `xlink:href`, `is=`, data-URI `style`). | Ship the **closed allowlist**; assert (test) no attribute lands on `<svg>` or the overlay. |
| `rng` | **NEEDS-GUARD** | See §5.4. It is a **live** injection point today (`EntvizVoiceCompare.ts:127` `rng = csprng` default, host-settable). | Compile-out in prod (below), not just a warning. |
| `fetchReference` | **SAFE** | Returns `{text}|{blob}`, never a verdict; bytes route through `classifyResult`→`compareSvg` (§6.2 gauntlet). SSRF is out of frame. | Keep the type as "bytes, never a verdict"; test parity with pasted bytes (§5.8). |
| `open`/`onOpenChange` | **NEEDS-GUARD** | See §5.3 — controlled open must not suppress provenance/scoping. | Structural, not present-by-default. |
| `allow`, `defaultWalkMode`, `fontSizeBounds`/`shapeBounds`, `includeContent` | **SAFE** | Restrict-only / within-spec / convenience. `defaultWalkMode` must not auto-reach an affirmative — the peek-caps-at-PENDING rule is in core, unchanged. `includeContent` defends a non-asset; harmless. | Keep `allow` allowlist-closed (`?? true` banned). |

---

## 3. Per-§5-item verdicts

### §5.1 — verdict symbol + non-inheritable tone — **REJECT (until fixed colors ship)**
*Asset:* equality belief · *Tier:* **T2** · *Win:* false "same".
**Attack (verified, live today):** `TONE.bad = "var(--entviz-compare-bad, #c4314b)"` (`:195`) and the chip is rendered `style:{ color: TONE[chip.tone], borderColor: TONE[chip.tone] }` (`:468`). An ancestor stylesheet on the embedding page sets `--entviz-compare-bad:#1a7f37`. Now the `≠ Different` chip — **symbol, label, and border** — renders in verdict-green. The designer's backstop ("the symbol is hard-coded") does NOT save this: the hard-coded *glyph* is painted in the *overridable* color, so `≠` itself turns green. Per F-3 (`findings-02`), color is the loud channel a distracted human reads as "match"; a green `≈`-shaped `≠` at a glance is a false same. Violates comparison-design §3/§14.6 ("reserve `=`/green for machine-IDENTICAL").
**Required mitigation:** ship the verdict chip's good/bad tone as **literal, non-var colors** (Open-Q1 "fixed colors" — take it). No `--entviz-*` on the verdict chip's semantic color, border, OR symbol. The symbol is a *backstop*, not the primary defense, so the color must be independently un-subvertible. Non-verdict chrome (menus, radii, pill body) may stay themeable. **Do not accept the "scoped-var with `!important`" alternative** — an ancestor `!important` on a custom property still wins the cascade for the property's *value*; only a literal color in the component is truly ancestor-proof.

### §5.2 — `messages` overrides prose only; verdict semantics leave the catalog — **NEEDS-GUARD**
*Asset:* equality belief · *Tier:* host (T2-adjacent) · *Win:* judgment-tamper → false "same".
**Attack:** as in the `messages` row above — the split does not exist in code yet; all verdict-bearing keys are in `CompareMessages` and merged unfiltered (`:202`). A malicious/careless "translation pack" sets `identical:"Different"` / `different:"Identical — the same value"`.
**Contract:** comparison-design §3/§14.6; pill-design §8 ("only CHROME is localized — never … verdict semantics").
**Required mitigation:** the exact keys to remove (confirmed against `compare-messages.ts`): **`identical`, `different`, `pending`, `unknownReason`, `unknownRasterSimilar`, `unknownAmbiguous`, `recognitionNote`, and all five `provenance*`**. Keep override-able: `pastePrompt`, `dropHint`, `fetchHint/Button/Error`, `heading`, `yours`, `reference`, tab/walk labels. Test: overriding a verdict/provenance key is a no-op. NOTE the designer's list in Open-Q3 **misses `unknownRasterSimilar`, `unknownAmbiguous`, and the `provenance*` family** — those are equally judgment-bearing (see V-1).

### §5.3 — provenance + §2.4 scoping render regardless of controlled `open` — **REJECT (claim is false in current code)**
*Asset:* equality belief (reference-authenticity) · *Tier:* T1/social (attacker supplies the reference) · *Win:* attacker-chosen reference read as trustworthy (F-8).
**Attack:** two independent holes make the "always renders / structurally non-suppressible" claim false **today**:
1. The provenance line (`:455–457`) is `provenanceLabel(...)` → a **`messages` string** (`m.provenanceProvided` etc.). `messages={{provenanceProvided:""}}` blanks it, or `provenanceProvided:"Verified — trusted reference"` *forges authority* — the opposite of §2.4's "never present a URL-fetched reference with the authority of a locally-held known-good copy."
2. **There is NO §2.4 scoping copy on the machine-verdict path at all.** `recognitionNote` is rendered only inside `EntvizWalk` (`:293`) and `EntvizVoiceCompare` (`:184`). The bare machine `=`/`≠` chip in `EntvizCompare` (`:465–473`) shows symbol + label + `machineCheck` and **nothing** that says "equal to THIS reference, not that it's trustworthy." An auto-open → inject `reference` → read green flow (which controlled `open` + `verdict.change` explicitly enable) yields a naked green with zero scoping. This IS the F-8 path.
**Contract:** comparison-design §2 (equality-soundness ≠ reference-authenticity), §2.4; findings-02 F-8 ("make provenance … a first-class, persistent part of the verdict, not a caveat").
**Required mitigation:** (a) move `provenance*` + `recognitionNote` out of `messages` (V-1); (b) **render the §2.4 scoping copy on the machine `identical` chip in `EntvizCompare`**, not only in Walk/Voice — a green machine `=` against a `provided`/`url` reference is exactly where F-8 bites; (c) make both structurally present (component-owned, not host-suppressible). Until (b) exists, the claim "scoping copy always renders" is simply untrue.

### §5.4 — `rng` compiled out of production — **NEEDS-GUARD (compile-out is not yet real)**
*Asset:* equality belief · *Tier:* T1+T6 · *Win:* false NO-DIFFERENCE.
**Attack:** `EntvizVoiceCompare` **already** takes `rng` and honors it in prod today (`:62`, `:127` `rng = csprng` default, `:146` `buildReadbackPlan(..., rng)`). A Storybook/demo seed left on, or a compromised host passing `rng:()=>0.5`, makes the ceremony's cell selection predictable; a T1+T6 attacker pre-forges exactly the cells the ceremony will sample, and every un-sampled cell (where the substitution hides) is never read → silent false NO-DIFFERENCE. Widening `rng` to Walk/Compare (the proposal) enlarges this.
**Contract:** comparison-design §14.2 ("unpredictable selection + order … *is* the anti-habituation mechanism"), §15.3/§15.9 (selection-unpredictability substitutes for the removed commitment).
**Required mitigation:** the compile-out must be **structural and tested**: a `NODE_ENV==="production"` (or build-flag) branch that *ignores the prop and always calls the platform CSPRNG*, tree-shaken so a prod bundle cannot honor an injected `rng`. A runtime warning is NOT sufficient. Apply uniformly to Walk, Voice, AND the threaded Compare. Test: in a prod build, injecting `rng:()=>0` still produces a CSPRNG-driven plan. Retire the existing unconditional Voice `rng` default in the same change.

### §5.5 — no `*.step` during a live ceremony; `voice.step` absent; `walk.step` kind+index — **REJECT (the existing leak is unfixed)**
*Asset:* equality belief · *Tier:* T2 / remote-steering peer · *Win:* a peer who learns the next cell pre-positions → false "same".
**Attack (live gap, not hypothetical):** `EntvizVoiceCompare.onStep` **already exists** (`:58`) and fires the CSPRNG-selected cell address *before the reader reads it*: `step = { kind:"text", cellIndex: state.plan.cells[state.index] }` (`:137–140`), and the visible address is `row ${cell.row+1}, column ${cell.col+1}` (`:193`). A host that wires `onStep`→a data channel to the counterparty hands the steering peer the next address in advance — re-opening exactly the channel §15.9 removes "by construction." The firehose correctly omits `voice.step`, but that does nothing about the *existing* `onStep` prop the ceremony ships with today.
**Contract:** comparison-design §14.2, §15.7 (local-only evidence), §15.9 (no joint seed / steering removed by construction).
**Required mitigation:** constrain `EntvizVoiceCompare.onStep` itself: fire it with an **opaque local token** (a monotonic ring-draw index), NOT the grid address / `cellIndex`, so a host *physically cannot forward the sampled address*. The address stays internal for the on-screen "row R, column C" prompt. Add a hard test: no step address leaves the endpoint during a ceremony (assert `onStep` payload contains no `cellIndex`/`row`/`col`). This is REJECT because the proposal *documents* the constraint (Open-Q5) but leaves the leaky prop in place; documentation is not a guard against a compromised/careless host.

### §5.6 — `style`/`className`/`data-*` to chrome root only, allowlisted — **NEEDS-GUARD**
*Asset:* SVG integrity + equality belief · *Tier:* T2 · *Win:* silent alteration / distortion / desync.
**Attack:** the allowlist handles attribute passthrough, but host **`style`** on the Compare root can still *cascade* `transform`/`filter`/`mix-blend-mode` down to a `figureBox` (`EntvizWalk.ts:412`) because CSS inheritance/containment isn't blocked. One figure distorted relative to the other = desync = false-same, no script needed.
**Contract:** `Entviz.ts:41–51`; comparison-design §14.3 (host-transform-proof container); pill-design §7 (closed profile).
**Required mitigation:** ship the closed allowlist AND give each figure box an isolation boundary that neutralizes inherited visual transforms (`contain: paint; isolation: isolate;` plus an explicit `transform:none; filter:none; mix-blend-mode:normal;` reset on `figureBox`). Test: a host root `transform`/`filter` does not alter either rendered figure's geometry/pixels.

### §5.7 — walk ring/scrim not erasable; overlay host-transform-proof — **REJECT (until fixed colors ship)**
*Asset:* equality belief (the walk directs the eye) · *Tier:* T2 · *Win:* defeat the walk → user "verifies" an unexamined cell → false "same".
**Attack (verified, live):** `RING = "var(--entviz-walk-ring, #39ff14)"`, `SCRIM = "var(--entviz-walk-scrim, #000)"` (`:73–74`). Ancestor CSS sets `--entviz-walk-ring:transparent; --entviz-walk-scrim:transparent;` → the spotlight and the dimming both vanish; the walk still asks "do the highlighted characters match?" but **nothing is highlighted**, so the user answers "same" on a cell they never located. Silent. Additionally `overlayStyle` uses `preserveAspectRatio:"none"` (`:99`) and `width/height:100%` (`:409`) — a host `transform`/`zoom` on an ancestor scales the figure but the mask geometry is in the entviz's user units; a non-uniform host scale can misalign ring vs. cell.
**Contract:** comparison-design §14.3 ("tool-controlled container … host-transform-proof").
**Required mitigation:** pin `RING`/`SCRIM` to **literal colors** (Open-Q2 "no" — take it); the spotlight is a security affordance, not decoration. AND make the overlay provably co-scaled with the figure (share one container that both the figure and overlay live in at fixed scale, so a host transform moves them together). Test: setting `--entviz-walk-ring/scrim` has no effect on the rendered ring; a host `transform:scale()` on the panel keeps ring aligned to cell.

### §5.8 — host `fetchReference` bytes run the §6.2 gauntlet — **SAFE**
*Asset:* equality belief + SVG integrity · *Tier:* T1 (attacker-authored SVG) · *Win:* forged IDENTICAL.
**Verified:** the fetched body flows `onFetch` → `setRef({content:text})` (`:314–316`) → `refContent` → `classifyResult` → `compareSvg`/`compareValues` (`:85–87`). The injected fetcher returns `{text}|{blob}`, never a verdict; it cannot hand back a pre-classified IDENTICAL. Core `compareSvg` runs the §6.2 gauntlet (strict closed-profile validation, recompute from recovered core, re-render through the pinned font, self-consistency). Raster never returns `identical` (`raster-compare.ts:162`). SSRF/egress is a host concern, correctly out of frame.
**Guard to keep (test, not new mitigation):** a test asserting injected-fetcher bytes get **byte-identical §6.2 treatment** to pasted bytes, and that the fetcher's return type can never carry a verdict. SAFE **conditional on** that test existing.

### §5.9 — verdict/verification events notify-only; only `fetch.start` cancelable — **SAFE**
*Asset:* equality belief · *Tier:* host · *Win:* host forces/suppresses a verdict.
**Verified:** only `fetch.start` carries `preventDefault` in the union; cancelling a fetch is fail-closed (deny egress only, never force a pass). `verdict.change`/`*.complete` are notify-only.
**Guard to keep (test):** a compile-time/type test that ONLY `fetch.start` has `preventDefault`, and a behavioral test that `walk.complete`/`voice.complete` cannot flip `different`/`inconclusive` → `no-difference`. SAFE conditional on that test.

### §5.10 — `allow` restrict-only, allowlist-closed — **SAFE**
*Asset:* low relevance (host-policy surface) · *Tier:* n/a to primary asset · *Win:* none directly.
**Verified reasoning:** a present `allow` treating unlisted keys as OFF (no `?? true`) is the correct least-surface shape. Not a false-same vector. Agree with the designer's own de-prioritization (correcting v1's over-weighting). Keep the `?? true`-banned rule as a lint/test.

### §5.11 — shared size/shape drives both figures; no desync — **NEEDS-GUARD**
*Asset:* equality belief · *Tier:* T2 · *Win:* two figures at different scale/shape read as same → false verdict-by-eye.
**Verified partial safety:** both panels render from one `dispFs`/`dispAr` (`:225–227,401,451`), so the *machine* keeps them synced and no prop exposes per-figure size. GOOD.
**Residual attack:** the desync re-enters via CSS (§5.6): host `style` cascading `transform:scaleX()`/`zoom` onto one panel resizes one figure independently. So 5.11 is only as strong as 5.6's figure-isolation.
**Required mitigation:** same figure-isolation boundary as §5.6; explicitly test that no host CSS can scale one figure box without the other. Confirm no future prop exposes per-figure size/shape.

---

## 4. ⚔ Tensions & disagreements with the designer (ranked, decidable)

Each: *Designer proposes X for reason R; I object because attack A violates contract C; counter-proposal P.* Tag = **[X]** proposal claim, **[R]** their rationale, **[A]** my attack, **[C]** contract, **[P]** my counter.

**T-1 (highest) — "hard-coded symbol is a sufficient backstop if the tone is subverted."**
- **[X]** §5.1/§4.2: the `=`/`≠` symbol is hard-coded, so even if color is themed, the symbol distinguishes.
- **[R]** Preserve some verdict-tone theming for hosts.
- **[A]** The chip paints the symbol in `TONE[chip.tone]` (`:468`), so overriding `--entviz-compare-bad` turns the `≠` glyph *itself* green — the backstop is painted by the thing it's supposed to back up. And per F-3, color is the channel a distracted human actually reads.
- **[C]** comparison-design §3/§14.6; findings-02 F-3.
- **[P]** Verdict chip good/bad tone = **literal colors, zero `--entviz-*`**, and draw the symbol in a color that is *independent* of any host var. Symbol is a secondary cue, never the sole one. (Decidable question for the maintainer: *any* theming on the verdict tone, yes or no? My answer: no.)

**T-2 — "provenance + §2.4 scoping copy are structurally non-suppressible."**
- **[X]** §5.3/§4.4: they render regardless of controlled `open`.
- **[R]** Keep them first-class under host control.
- **[A]** Both are **`messages` strings** today (`provenance*`, `recognitionNote`) → host blanks or forges them; and the machine-verdict chip in `EntvizCompare` renders **no scoping copy at all** (`recognitionNote` lives only in Walk/Voice). "Structurally non-suppressible" is aspirational, not real.
- **[C]** comparison-design §2/§2.4; findings-02 F-8; pill-design §8.
- **[P]** Move `provenance*` + `recognitionNote` into a frozen catalog; render the §2.4 scoping line on the machine `=` chip in `EntvizCompare` itself. (Decidable: is "present by default" enough, or must it be component-owned + host-unreachable? My answer: the latter.)

**T-3 — "`walk.step` suppression + omitting `voice.step` closes the check-order leak."**
- **[X]** §5.5/§2.2: no `*.step` during a live ceremony; `voice.step` doesn't exist.
- **[R]** Keep the ergonomic `onStep` for local ring-drawing.
- **[A]** The *existing* `EntvizVoiceCompare.onStep` prop already emits the live grid address (`cellIndex`/`row`/`col`) before read-back; the firehose omission is irrelevant while that prop ships the address in a relayable form.
- **[C]** comparison-design §14.2/§15.7/§15.9.
- **[P]** Change `onStep` to emit an **opaque local index**, never the address; hard test that no address leaves the endpoint. (Decidable: is documenting "don't relay" acceptable, or must the API make relay impossible? My answer: impossible-by-construction.)

**T-4 — "a runtime warning on a seeded `rng` is a fine additional guard."**
- **[X]** §5.4/Open-Q4: compile out, *warning additional*.
- **[R]** Dev/test need injectable `rng`.
- **[A]** The existing Voice `rng` is honored in prod **now**; widening it to Walk/Compare before the compile-out lands enlarges a live false-NO-DIFFERENCE surface. A warning defends nothing against a compromised host.
- **[C]** comparison-design §14.2/§15.3/§15.9.
- **[P]** Compile-out first, tree-shaken + tested, uniformly across Walk/Voice/Compare, and *retire the unconditional Voice default in the same PR*. The prop-widening must not merge before the gate. (Decidable: does the `rng`-widening ship in the same PR as the compile-out, or can it land earlier? My answer: same PR, gate-first.)

**T-5 — "host `style`/`className` on the root is safe because passthrough is allowlisted."**
- **[X]** §5.6/§5.11: allowlist forbids dangerous *attributes*.
- **[R]** Hosts need layout control on the root.
- **[A]** The allowlist stops *attributes* but not CSS *inheritance/cascade*: `style` on the root can still push `transform`/`filter`/`mix-blend-mode` down to a `figureBox`, distorting/desyncing one figure. Attribute allowlisting ≠ visual isolation.
- **[C]** `Entviz.ts:41–51`; comparison-design §14.3; pill-design §7.
- **[P]** Add a real isolation boundary on each figure box (`contain:paint; isolation:isolate;` + `transform/filter/mix-blend-mode` reset) and test it; the allowlist alone is necessary-not-sufficient. (Decidable: is chrome-root-only passthrough enough, or must figures be CSS-isolated? My answer: isolate.)

**T-6 (lowest) — "Open-Q6: content-in-events could even be ON by default."**
- **[X]** Open-Q6: since confidentiality is out of scope, `includeContent` could default on.
- **[R]** Value is public; simpler DevX.
- **[A]** No integrity objection (I do NOT file this as confidentiality). The only *integrity-adjacent* caution: the `secret.detected`/banner UX is a usability affordance; flipping content on-by-default is a pure DevX call with no false-same consequence.
- **[C]** none (out-of-scope asset).
- **[P]** Designer's call; I neither block nor endorse. Left here only so the maintainer sees I considered and declined to inflate it into a finding.

---

## 5. Integrity vectors the designer did NOT flag

**V-1 — the override-able catalog is wider than §5.2/Open-Q3 admits.** Open-Q3 lists only `identical/different/pending/unknownReason/recognitionNote` as verdict-bearing. But `compare-messages.ts` also exposes **`unknownRasterSimilar`** (the `≈` "no visible difference" copy — a host can rewrite it to read like a match), **`unknownAmbiguous`**, and the **entire `provenance*` family** (`provenancePasted/File/Url/Dropped/Provided`). All are judgment/authenticity-bearing and all are override-able. *Asset:* equality belief + reference-authenticity. *Tier:* host. *Win:* relabel/forge. **Mitigation:** the frozen-catalog split must include these; do not ship Open-Q3's shorter list.

**V-2 — the machine-verdict path has no scoping copy at all (distinct from V-1).** Even with `recognitionNote` frozen, it is simply **not rendered** on the `EntvizCompare` machine chip (`:465–473`); it only appears after a Walk/Voice completes (`EntvizWalk.ts:293`, `EntvizVoiceCompare.ts:184`). The most dangerous verdict — a green machine `=` against a `provided`/`url` reference, reached *without* any human walk — is exactly the one with zero "equal to THIS reference, not that it's trusted" framing. This is the F-8 vector on the fastest path. *Asset:* reference-authenticity. *Tier:* T1/social. *Win:* attacker-chosen reference read as trustworthy. **Mitigation:** render the §2.4 scoping line on the machine `identical` chip, component-owned.

**V-3 — `provided` reference silently loses URL/origin provenance.** At `:250` a host-`reference`-prop reference is stamped `provenance:"provided", origin:""` and renders the generic `m.provenanceProvided` ("Reference: provided") — even if the host obtained those bytes from an attacker URL. There's no way for the user to see the *real* origin of a `provided` reference. Combined with V-2 (no scoping copy) this is the cleanest headless F-8: host auto-injects an attacker's value as `reference`, user sees green `=` + "Reference: provided" and concludes "verified." *Asset:* reference-authenticity. *Tier:* T1/social. *Win:* false trust. **Mitigation:** either forbid a `provided` reference from reaching a green machine verdict without surfacing that it was host-supplied (not human-acquired), or require the §2.4 scoping copy specifically emphasize "provided by the page, not by you" for `provenance:"provided"`. The designer's own `verdict.change.provenance` field is the *telemetry* half of this, but the *user-facing* half is missing.

**V-4 — `render.error`/`fetch.error`/`readError` free-form messages can carry attacker-influenced prose into the host UI.** Under the corrected frame this is NOT a confidentiality finding, and it is NOT a false-same on the value. I flag it only at the boundary: if a host renders `fetch.error.message` / `readError.reason` verbatim near the verdict chrome, an attacker-controlled URL/file whose error string reads like "Match confirmed" could *visually adjoin* the verdict and mislead by juxtaposition. Weak (requires the host to render errors adjacent to the verdict) — **NEEDS-GUARD at documentation level only**: note that error strings are diagnostics, not verdicts, and hosts should not render them in the verdict region. Not ship-blocking.

---

## 6. What is genuinely SAFE (I tried to break it and failed)

- **The firehose as a whole.** Values are public; no event distorts the glyph, desyncs the pair, moves the machine verdict, or (with `voice.step` correctly absent) leaks the ceremony order. The v2 re-scoping away from the confidentiality apparatus is *correct* — v1's metadata firewall defended a non-asset.
- **`fetchReference` returning bytes-not-verdict** (§5.8) — the §6.2 gauntlet in core is the real guard and the injected path routes through it; raster never returns `identical`.
- **Notify-only verdict invariant** (§5.9) — only `fetch.start` is cancelable and cancelling is fail-closed.
- **`allow` restrict-only** (§5.10).
- **Shared `dispFs`/`dispAr` machine sync** (§5.11) — sound at the machine level; the only residual is the CSS desync, which is really §5.6.

These are SAFE **conditional on** their guarding tests existing (parity test, `preventDefault`-only-on-`fetch.start` test). Without the tests they are "correct today, one refactor from broken" — the designer asked for exactly these tests and I concur.

---

## 7. Bottom line for the maintainer

The corrected frame is right and the event surface is not the danger. **Ship the events freely. Do NOT ship the configuration surface until four things are literal, structural, and tested:** (1) verdict chip + walk ring/scrim = **fixed colors, no `--entviz-*`** (T-1, T-5-adjacent, §5.1/§5.7); (2) verdict + provenance + scoping strings = **frozen, host-unreachable**, and the §2.4 scoping copy actually **rendered on the machine chip** (T-2, §5.2/§5.3, V-1/V-2/V-3); (3) `EntvizVoiceCompare.onStep` emits an **opaque token, never the address** (T-3, §5.5); (4) `rng` **compiled out of prod**, uniformly, tests-first, before the prop widens (T-4, §5.4). Everything else is documentation-and-a-test.
