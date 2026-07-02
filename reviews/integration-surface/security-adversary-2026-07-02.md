# Integration-Surface Security Adversary — attack on the `@entviz/react` API proposal

**Date:** 2026-07-02
**Stance:** adversarial application-security reviewer. My job is to break the surface, not
appreciate it. I default to REJECT/NEEDS-GUARD for any content or network surface unless the
mitigation is airtight.
**Target:** `reviews/integration-surface/proposal-2026-07-02.md` (the DevX firehose proposal).
**Commit examined:** `d9180a4397760f5db97b0105aad565c1e813bb01` (branch `main`).
**Contracts defended:** `comparison-design.md` §2 (five first principles), §5 (acquisition;
origin-before-fetch; fail-closed; confidentiality out of scope), §6.2 (SVG attacker-authorable),
§14.2 (unpredictable order), §14.6 (verdict machine), §15.3/§15.7 (ceremony selection-
unpredictability, local-only evidence); `pill-design.md` §2 (recognition ≠ verification, closed
profile), §3.3 (no value-derived visual, zero identity bits), §8 (never localize/case-fold the
value); `EntvizCompare.ts` (`looksLikeSecret` 95–102, `onFetch` 311–320, the acquisition flow);
`Entviz.ts` 41–51 (the documented no-XSS injection contract); `findings-02-usable-security.md`
(F-4/F-5/F-8/F-9).

---

## 1. Executive summary

**Safe to build as-is? NO.** The metadata-vs-content line the whole proposal rests on is *drawn
in the right place conceptually* but is **not airtight at the seams**, and three of the twelve
handoff claims contain live leaks or capability grants that the designer under-rates. The
designer has done the honest thing and flagged the firehose as the sharpest risk; my job is to
show that even the *metadata-tagged* defaults leak, that one of the "restrict-only" props is
actually a capability, and that two "safe" props are silently defeat-a-protection footguns.

**The single most dangerous item:** **`fetchReference` (handoff #6 / prop) combined with the
current `onFetch` code path.** Today `onFetch` (`EntvizCompare.ts:311–320`) calls
`fetch(refContent)` on a **user-pasted URL**, from the page's own origin, with `credentials`
at the platform default and **no allowlist, no origin gate in code** (the origin is only
*displayed*, never *enforced*). The proposal formally blesses a host-injected fetcher and says
"origin-before-fetch still holds" — but the code shows origin is a *display* string, not a
consent gate, and the proposal's own §5 admits the fetcher "runs server-side with ambient
credentials" in the worst host. That is a first-class SSRF + credentialed-exfiltration primitive
that the widget is *inviting the host to wire up*, and the re-classification guard the designer
leans on (§6.2) protects the *verdict*, not the *network egress*. This must be REJECTed in its
proposed shape and rebuilt as a consent-gated, origin-pinned, non-credentialed fetch.

**Second most dangerous:** the content door is not one door. `unsafeIncludeContent` is the
*named* door, but `render.error.message`, `fetch.error.message`, `reference.readError.reason`,
and the `secret.detected` beacon are **unnamed side-channels** that carry value-derived bytes or
a "this user just pasted a private key" signal out through the same `onEvent`→logger wiring, with
a `safe` tag that tells the host's policy filter to log them freely.

**Verdict counts (per-item, 12 handoff claims + the notable event/prop surfaces):**

| Verdict | Count |
|---|---|
| **REJECT** | 5 |
| **NEEDS-GUARD** | 13 |
| **SAFE** | 4 |

REJECTs: (a) `fetchReference` as proposed [#6]; (b) `unsafeIncludeContent` as an event-*push*
field [#5]; (c) `secretWarning:"off"` suppression path [#8]; (d) `rng` injection shipped in
production builds [#10]; (e) error-`message`/`reason` fields tagged `safe` (undeclared content
channel — designer failed to flag).

---

## 2. Per-item verdicts

Ranked by realistic-harm × how-silent. Each: verdict · concrete attack (scenario, not a vibe) ·
contract § violated · required mitigation.

### 2A. The twelve §5 handoff claims

---

**#1 — Firehose `onEvent` across the whole journey. → NEEDS-GUARD.**

*Attack.* The claim's own escape clause ("safe because every default payload is metadata-only")
is only as true as items #2–#4 and the error-message channel (below). The firehose *aggregates*
`provenance` + `medium` + `byteLength` + `secret.detected` + `verdict.change` + the full
`walk.step`/`voice.step` address stream on one monotonic `seq` timeline. Even with zero content
fields, that tuple is a **correlation fingerprint**: `{provenance:"pasted", medium:"text",
secret.detected:where="value", byteLength:64, verdict:different}` streamed to a third-party
observability service says "this user pasted a 64-byte secret that did NOT match the reference" —
a behavioral profile that did not exist before entviz was embedded. The try/catch is orthogonal
to leakage; it only stops a host bug from wedging the widget.

*Contract.* §5 (confidentiality out of scope means the widget must not *manufacture* new
disclosure surfaces); §2.4 (provenance is security-sensitive, not telemetry-free).

*Mitigation.* (1) Ship `onEvent` **off unless a prop is passed** (it already is — keep it opt-
in and document that wiring it to a third-party logger is a data-flow decision the host owns).
(2) Add a coarse `sensitivity` gate the host can hard-cap: a `maxSensitivity?: "safe"|"network"`
prop that *drops* events above the cap **inside the component**, so a policy-bound host cannot
accidentally receive `content`/beacon events at all. (3) `secret.detected` MUST be excluded from
the default firehose (see #3).

---

**#2 — `reference.acquired.byteLength` by default. → NEEDS-GUARD.**

*Attack.* `byteLength` is a length oracle, and the designer half-concedes it. Concretely: an
ed25519 raw private key is 32 bytes; a `did:key` ed25519 is a fixed 48–49-char multibase; a
BIP39 12-word mnemonic is a tight length band; a secp256k1 WIF is 51–52 chars; an `xprv` is 111
chars. Combined with `medium:"text"` + `secret.detected` + `provenance:"pasted"`, an exact
`byteLength` **fingerprints which secret type** was pasted without a single content byte — enough
for an observability-service-side attacker to know "user X holds an ed25519 seed" and target them.
Open-Q2's bucket (`<32/32–64/64–128/128+`) is *insufficient*: those buckets still separate a
32-byte raw key from a 64-byte one, and a 32-byte bucket edge is exactly where the key types live.

*Contract.* §5 (do not lull / do not manufacture disclosure); §2.4.

*Mitigation.* When `secret.detected` is true, **omit `byteLength` entirely** (not bucket it) —
a secret's length is never telemetry the host legitimately needs. For non-secret media, exact
length is fine. This is stricter than Open-Q2's recommended default; adopt it.

---

**#3 — `secret.detected` emits the fact + `where`, non-cancelable. → REJECT (as a default
firehose event) / NEEDS-GUARD (as opt-in).**

*Attack.* Two independent breaks. **(a) The beacon.** Firing `{type:"secret.detected",
where:"value"}` into `onEvent` is, verbatim, a "this user just pasted a private key" event
delivered to whatever the host wired the firehose to — an analytics pipeline, a session-replay
tool, a SIEM. That is a *new* privacy signal the widget invented; §5 says confidentiality is out
of scope, which forbids the widget from *creating* confidentiality-relevant telemetry, not just
from ignoring it. **(b) The false-coverage trap.** `looksLikeSecret` (`EntvizCompare.ts:95–102`)
matches ONLY: PEM `-----BEGIN … PRIVATE KEY-----`, `xprv/xpriv/tprv` + 50+ base58, and 12–24
all-lowercase 3–8-char words. It **misses**: raw-hex private keys (`0x…` / 64 hex), base64 keys,
JWTs / bearer tokens, AWS `AKIA…`, `sk-…` API keys, PKCS#8 DER, and any mnemonic with a
capitalized or non-`[a-z]` word. A host that wires `secret.detected` into DLP gets **false
coverage**: the event is silent on the majority of real secrets, so the DLP believes "no secret
here" and the banner never shows.

*Contract.* §5 (out-of-scope confidentiality must not become an emitted signal; warn-don't-lull —
a best-effort heuristic sold as a DLP feed lulls); F-9.

*Mitigation.* (1) `secret.detected` is **not** in the default firehose; it requires an explicit
`enableSecretSignal: true` opt-in AND its docstring must state "best-effort, false-negative-
prone; NOT a DLP guarantee." (2) It carries `where` but the payload MUST be flagged
`sensitivity:"content"`-adjacent so `maxSensitivity` (#1) filters it. (3) Non-cancelability is
correct and must stay — keep it.

---

**#4 — `walk.step`/`voice.step` are `safe` (feature-kind / grid-address). → NEEDS-GUARD.**

*Attack.* The single-user local case is fine; the *sequence* is the problem the designer names
but under-mitigates. The ordered stream of `walk.step.index`/`voice.step.cellAddress` **is the
CSPRNG-selected check order** (§14.2) or the authenticator's live selection (§15.3). §15.7
mandates the ceremony verdict be **local-only evidence** — "there is nothing to be tempted to
trust from the other screen." A firehose that streams the live check-order off the endpoint to a
host that can relay it to the *counterparty* re-introduces exactly the steering channel §15.9
removed "by construction (no joint seed)": a peer who learns the next address before the reader
speaks can pre-position. The proposal streams it to `onEvent` unconditionally.

*Contract.* §14.2 (unpredictable order is the anti-habituation mechanism); §15.3 (selection is
the anti-pre-forge mechanism); §15.7 (local-only evidence).

*Mitigation.* `voice.step` (and `walk.step` when the walk is inside a live ceremony) MUST be
**suppressed entirely from `onEvent`** — the live check-order never leaves the local endpoint,
full stop. For the single-user machine walk, emit `walk.step` with `index` only, and document
"do not relay to any remote party." Add a hard invariant test: no `*.step` event fires while a
`voice`/live ceremony is active.

---

**#5 — `unsafeIncludeContent` puts raw value/reference bytes into events. → REJECT (as an event-
push field); NEEDS-GUARD (only as an imperative pull).**

*Attack.* The designer steelmans this well and then loses to their own Risk-Z. A boolean prop is
flippable by: a copy-pasted config block, a "temporarily debugging" toggle left on in prod, or a
host framework that **spreads unknown props** (`<EntvizCompare {...allProps} />`) — the same
prop-spreading vector the designer worries about for `data-*` in #12. Once on, *every*
`reference.acquired` and `fetch.start` streams the secret to the host's logger **ambiently**, on
every keystroke-driven re-acquire. An event-push field means the leak is *continuous and
invisible*; there is no per-read consent. The name `unsafe*` is a convention, not a guard —
review catches it once, config drift ships it.

*Contract.* §5 (confidentiality out of scope → the widget must not build an ambient content
firehose); §2 (the value may be a private key).

*Mitigation.* **Drop the event-push content field entirely.** Content retrieval becomes an
imperative, per-call pull off a ref-handle: `ref.getReference()` returns the bytes **once, on an
explicit synchronous call**, so retrieval is an act the host code performs deliberately, not an
ambient stream a flipped flag turns into a firehose. This is Open-Q1's "preferred path" — make it
the *only* path. Even the pull handle stays pill-forbidden.

---

**#6 — Host-injected `fetchReference(url, {origin, signal})`. → REJECT (as proposed).**

*Attack (the headline).* This is the most dangerous item. The threat model's worst host runs the
fetcher **server-side with ambient credentials** (persona brief). The URL is **victim-pasted**
(`refContent`) — an attacker who social-engineers a victim into pasting
`http://169.254.169.254/latest/meta-data/iam/security-credentials/` (cloud metadata),
`http://localhost:6379/` (internal Redis), or `https://internal-admin/…` drives the host's
credentialed fetcher at internal targets: **classic SSRF.** Worse for exfiltration: the victim's
*own value* can be embedded in the URL the attacker tells them to paste
(`https://evil.tld/?leak=<they-append-their-value>`), and `fetch.start.url` under content opt-in,
or just the fetch itself, carries it out. The designer's guard — "origin-before-fetch still
holds, result re-classified fail-closed" — protects the **verdict** (§6.2 stops a forged
IDENTICAL) but does **nothing** to stop the **network egress or the credential use**; those
already happened by the time bytes come back. And the *current code* (`onFetch`,
`EntvizCompare.ts:311–316`) does a bare `fetch(refContent)` with no allowlist, no credential
scrubbing, no origin *enforcement* — origin is only rendered as a hint string. Blessing a
host fetcher on top of that widens the blast radius exactly as Risk-Z fears.

*Contract.* §5 (URL fetch carries CORS/referrer/attacker-chosen-reference; surface origin before
fetch — but "surface" must mean *consent-gate*, not *display*); §2.4 (attacker-chosen reference).

*Mitigation (all required).* (1) **Origin-before-fetch must be a consent gate in code, not a
display string:** no fetch fires until the user clicks a button that shows the resolved
`origin`; the built-in fetch must set `credentials:"omit"` and `redirect:"error"` (or re-consent
on cross-origin redirect, so a `200→302→metadata` chain can't slip the gate). (2) The injected
`fetchReference` contract MUST require the host to honor the same: pass `{origin, signal,
credentials:"omit"}` and document that a credentialed/server-side fetcher is the host's owned
SSRF risk, called out in the prop's *name* or a required `acknowledgeFetchRiskOwned` flag,
paralleling #8. (3) `allow.url:false` stays the airgap default for DLP hosts. (4) Never place
the fetched URL (which may carry the victim's value) into any event unless the imperative pull of
#5 is used. Without (1)+(2) this is a REJECT.

---

**#7 — `allow.*` turns methods OFF, never ON beyond built-ins. → NEEDS-GUARD.**

*Attack.* The invariant is right *as stated*; the risk is the implementation. The proposal
defaults `allow` to all-`true` and says "disabling a key removes a path." A prop-spreading host
that passes `allow={{}}` (empty object) — or a partial `allow={{paste:true}}` — must **not** be
read as "url defaults to true because the key is missing"; if the reducer is
`allow.url ?? true`, then a host that *thinks* it disabled everything by passing `{paste:true}`
still has `url` (and thus fetch/SSRF) live. That is the "missing key = enable" failure the
designer asks the adversary to check — and the obvious naive implementation hits it.

*Contract.* §5 (restrict-only must be monotonic toward less surface).

*Mitigation.* The semantics MUST be: a *present* `allow` object is **allowlist-closed** — any key
not explicitly `true` is OFF. Only a *fully absent* `allow` prop means all-on (source-compat).
`allow.url ?? true` is banned; use `allow ? (allow.url === true) : true`. Add a test:
`allow={{}}` disables every method including url.

---

**#8 — `secretWarning:"off"` requires a second `acknowledgeSecretRiskOwned:true`. → REJECT (the
suppression path itself).**

*Attack.* The banner is a load-bearing usable-security mitigation (F-9; §5 "warn rather than
lull"). Any suppression path, however double-gated, means some hosts ship it off, and users of
*those* hosts paste seed phrases with zero warning — the mitigation degrades to "we told the host
to be careful," which is not a mitigation. The two-flag gate raises the bar for *accidental*
suppression but does nothing against a host that *deliberately* wants a clean UI and flips both.
The banner is the only thing standing between a distracted user and pasting a private key into a
comparison aid; it is not the host's to silence.

*Contract.* §5 (confidentiality out of scope → the *warning* is the compensating control the
threat model relies on); F-9.

*Mitigation.* Make the banner **non-suppressible in content**: `secretWarning` may re-*style* or
re-*word* it (localization, theming, F-9's "themeable") and may set `detect` to *widen* coverage,
but there is **no `"off"`** — the warning always renders when the (widened-only) detector fires.
If a host truly needs the space, it can restyle to a single-line inline note, but it cannot make
it vanish. Drop `"off"` and `acknowledgeSecretRiskOwned`. (`secret.detected`-as-signal is handled
separately under #3.)

---

**#9 — `fetch.start` advisory-cancelable; everything else notify-only. → SAFE (with a type-system
guard).**

*Attack.* I tried to break this and mostly failed — a cancel that can only *deny* egress is
fail-closed and cannot force a pass. The residual risk is exactly the one the designer names:
`preventDefault` semantics leaking to a future `verdict`/`secret` event by pattern-match. That's a
real maintenance hazard, not a live attack.

*Contract.* §3/§14.6 (verdict authority); §5 (fetch consent).

*Mitigation.* Enforce cancelability **in the type system, not by convention**: only the
`fetch.start` variant carries `preventDefault?: () => void`; the `EntvizEvent` union must make it
a compile error to call `preventDefault` on any other member. Add a test that `verdict.change`,
`secret.detected`, and `*.complete` have no `preventDefault`. With that, SAFE.

---

**#10 — Generalize `rng` injection to Walk + Compare, default CSPRNG. → REJECT (in production
builds).**

*Attack.* A predictable/seeded `rng` shipped to prod defeats the unpredictable-order anti-
habituation (§14.2) AND the ceremony's selection-unpredictability that substitutes for the
removed commitment (§15.3, §15.9 "removes the steering threat by construction"). If an attacker
knows the sequence (because the host shipped a seeded `rng` for a Storybook/demo and left it in,
or because `rng` is host-controllable and the "host" is compromised), they **pre-forge exactly
the sampled cells** — the walk checks precisely the cells the attacker prepared, and every
non-sampled cell (where the substitution lives) is never looked at. This is a false-NO-DIFFERENCE
by configuration, silent, and it defeats the core anti-pre-forge property. Open-Q3's "console
warning" is not a guard — nobody reads console warnings in prod, and the attacker doesn't care.

*Contract.* §14.2 (CSPRNG-driven unpredictable order); §15.3/§15.9 (selection-unpredictability
replaces commitment).

*Mitigation.* `rng` injection MUST be **compiled out of production builds** — gated behind a
build flag / `process.env.NODE_ENV !== "production"` so a production bundle ignores an injected
`rng` and always uses the platform CSPRNG. Storybook/visual-regression run in dev/test where the
flag permits it. A runtime console warning is *additional*, never the primary guard. This is
stricter than Open-Q3; adopt the compile-out.

---

**#11 — `disclosure.change`/`open`/`onOpenChange` for controlled disclosure. → NEEDS-GUARD.**

*Attack.* The events don't create the headless-compare path, but they *complete* it. With the
existing `reference` prop (`EntvizCompare.ts:39,250`) a host already supplies an attacker-chosen
reference programmatically; adding controlled `open`→compare + `verdict.change` read-out makes the
**entire journey scriptable end-to-end with no human in the loop**: auto-open → auto-inject
attacker reference → read `verdict.change`. §2.4 (equality ≠ reference-authenticity) and F-8 warn
that a green verdict against an attacker-chosen reference is meaningless; making it *automatable
and observable* eases the social-engineering path ("embed our widget, we'll drive it"). The
provenance that §2.4 mandates as first-class is *not* enforced to render when disclosure is host-
controlled.

*Contract.* §2.4 (provenance first-class; equality ≠ authenticity); F-8.

*Mitigation.* (1) Controlling `open` MUST NOT suppress the provenance chrome or the §2.4 "you
verified against THIS reference" scoping copy — those render regardless of controlled state. (2)
`verdict.change` with a `provided`-provenance reference MUST carry `provenance:"provided"` in the
payload so a host's own telemetry records that the affirmative was against a host-supplied ref,
not a human-acquired one. (3) Document that controlled disclosure + provided reference is a
headless configuration and the verdict is scoped to the provided reference only.

---

**#12 — `data-*`/`aria-*`/`id` passthrough onto chrome root. → NEEDS-GUARD.**

*Attack.* Passthrough is a classic injection vector and the filter is the whole security. The
`Entviz.ts:41–51` contract holds *only because* the SVG carries renderer-produced attributes
exclusively. An incomplete allowlist lets a prop-spreading host land, near the closed artifact:
`onClick`/`on*` (event handler), `href`/`xlink:href` (navigation/`javascript:`), `style` with a
CSS injection, or a raw-HTML-injection prop. A **blocklist** ("exclude `on*`/`href`/`style`") is
the wrong shape — it fails open on the next dangerous attribute (`formaction`, `xlink:href`,
`srcdoc`, data-URI `style`, `is=`). The proposal describes filtering as "exclude
`on*`/`href`/`style`-on-SVG," which is blocklist-shaped.

*Contract.* `Entviz.ts:41–51` (no caller-provided markup/URLs/handlers reach the SVG);
pill-design §2 (closed profile — nothing on the artifact).

*Mitigation.* **Allowlist, not blocklist:** pass through ONLY attributes matching
`^(data-[a-z0-9-]+|aria-[a-z]+|id|role|title)$` with string values, onto the chrome root ONLY,
and assert (test) that nothing lands on the entviz `<svg>`. Reject any `on*`, any attribute whose
value is a function, and anything not matching the allowlist. Never spread onto or near the SVG.

### 2B. Notable event/prop surfaces the table introduces

- **`render.error.message` / `fetch.error.message` / `reference.readError.reason` — tagged
  `safe`. → REJECT (the `safe` tag).** *Attack:* renderer/fetch/decode error strings routinely
  echo the offending input. A `describeChannels` throw on a bad value can include the value
  substring in its message; `fetch.error.message` can be `"Failed to fetch https://evil/?<value>"`
  (URL with embedded value); a `FileReader` reason can carry a filename that is itself sensitive.
  Tagging these `safe` tells the host's policy filter to log them — an **undeclared content
  channel** bypassing `unsafeIncludeContent`. *Contract:* §5. *Mitigation:* these carry a fixed
  enum of *reasons* (`"bad-value"`, `"decode-failed"`, `"network-error"`), **never the thrown
  string**; tag `network` for fetch. The raw diagnostic stays local (console), never in the event.

- **`copy` event `byteLength` for `kind:"value"`. → NEEDS-GUARD.** *Attack:* same length-oracle
  as #2 — a copied value's byte-length + `kind:"value"` fingerprints the secret type on every
  copy. *Contract:* §5; pill-design §3.3 (zero identity bits from the pill). *Mitigation:* omit
  `byteLength` for `kind:"value"` when `looksLikeSecret` fires; the pill emits no value-derived
  quantity by default (§3.3).

- **`fontSizeBounds`/`shapeBounds`. → SAFE.** Cosmetic; bounded to the spec `[6,30]` ladder;
  cannot change the rendered value. No attack found.

- **`onOpenChange`. → SAFE.** Notify-only, gates no safety. (Its risk lives in `open`/#11.)

- **`unsafeIncludeContent` ignored on the pill. → SAFE (as a rule) but see #5** — correct that
  the pill must never emit value bytes (§3.3); the rule is right, but the field it guards should
  not exist as a push channel at all.

---

## 3. ⚔ Tensions & disagreements with the designer (ranked)

*Each: Designer proposes X for reason R; I object because attack A violates contract C; my
counter-proposal is P. Ranked by decidable stakes.*

**T-1 (highest). Origin-before-fetch: display vs. consent gate.**
- **X:** the injected `fetchReference` is safe because "origin-before-fetch still holds"
  (handoff #6, §4.4), citing `fetchHint` at `EntvizCompare.ts:375`.
- **R:** it preserves DevX (proxy/auth/CORS/tests) while keeping the §5 origin discipline.
- **A:** in code, origin is a *rendered hint string*, and the fetch is triggered by a button that
  fetches `refContent` directly — origin is *shown*, never *enforced as consent*; a
  server-side/credentialed host fetcher then makes this an SSRF + credential-exfil primitive on a
  victim-pasted URL (metadata endpoints, internal hosts, value-in-URL).
- **C:** §5 (surface origin *before* fetch — must be a gate), §2.4 (attacker-chosen reference).
- **P:** origin-before-fetch becomes a **code-level consent gate**: no fetch until the user
  confirms the resolved origin; built-in fetch is `credentials:"omit"`, `redirect:"error"`; the
  injected fetcher contract requires the same and a `acknowledgeFetchRiskOwned` flag if it runs
  credentialed. Decidable: *is origin a display string or a consent gate?* I say gate.

**T-2. Content as an event-push field vs. imperative pull.**
- **X:** keep `unsafeIncludeContent` as an `onEvent` payload field (handoff #5, Open-Q1).
- **R:** DevX parity — hosts get content on the same firehose they already consume.
- **A:** a boolean flippable by config-drift or prop-spreading turns *every* `reference.acquired`
  into an ambient, per-keystroke secret firehose to the host's logger; there is no per-read
  consent, and the `unsafe` name is a convention review catches once and drift defeats.
- **C:** §5 (confidentiality out of scope → no ambient content firehose); §2.
- **P:** **drop the push field; content only via `ref.getReference()` imperative pull** — one
  deliberate call per read, still pill-forbidden. Decidable: *push field or pull handle?* Pull.

**T-3. Secret warning: suppressible-with-ack vs. non-suppressible.**
- **X:** `secretWarning:"off"` allowed behind a second `acknowledgeSecretRiskOwned:true`
  (handoff #8).
- **R:** the host owns its UI; a double gate stops fat-fingering.
- **A:** any suppression path ships in *some* host, and *those* users paste seed phrases with no
  warning; the double-gate stops accidents, not deliberate clean-UI suppression — the mitigation
  degrades to "we told the host to be careful."
- **C:** §5 (the warning is the compensating control for out-of-scope confidentiality); F-9.
- **P:** **no `"off"`.** `secretWarning` may re-style/re-word/widen-detect, never hide. Drop the
  ack flag. Decidable: *may a host make the banner vanish?* No — style only.

**T-4. `rng` injection: runtime warning vs. compiled-out in prod.**
- **X:** accept injected `rng` in all builds, emit a console warning when non-CSPRNG (handoff #10,
  Open-Q3).
- **R:** Storybook/visual-regression need determinism; a hard compile-out breaks them.
- **A:** a seeded `rng` in prod (config drift, or host-controllable + compromised host) lets an
  attacker pre-forge exactly the sampled cells → silent false-NO-DIFFERENCE; nobody reads console
  warnings in prod.
- **C:** §14.2 (CSPRNG unpredictable order), §15.3/§15.9 (selection-unpredictability replaces
  commitment).
- **P:** **compile `rng` injection out of production builds** (build-flag / `NODE_ENV` gate);
  dev/test may inject; console warning is additional. Decidable: *does a prod bundle honor an
  injected `rng`?* No.

**T-5. `secret.detected` as a default firehose event vs. opt-in, and DLP framing.**
- **X:** `secret.detected` fires by default, carries `where`, sold as enabling "DLP/telemetry"
  (handoff #3).
- **R:** hosts can nudge/record without the payload being the leak.
- **A:** (a) it's a "user pasted a private key" beacon into the host's logger — a new privacy
  signal the widget invented; (b) `looksLikeSecret` (95–102) misses hex/base64/JWT/API-key/AWS
  secrets, so DLP built on it has false coverage.
- **C:** §5 (must not manufacture confidentiality telemetry); F-9.
- **P:** **not in the default firehose**; behind `enableSecretSignal`, docstring says
  "best-effort, false-negative-prone, NOT DLP"; `maxSensitivity`-filterable; keep non-cancelable.
  Decidable: *default-on beacon or opt-in best-effort signal?* Opt-in.

**T-6. `byteLength` for secret-shaped inputs: bucket vs. omit.**
- **X:** emit exact `byteLength`, coarsen to buckets when `secret.detected` (handoff #2,
  Open-Q2).
- **R:** preserves telemetry value cheaply.
- **A:** buckets (`<32/32–64/…`) still separate the key types that cluster at those exact edges;
  length + medium + provenance fingerprints *which* secret.
- **C:** §5; §2.4.
- **P:** **omit `byteLength` entirely when `secret.detected` is true** (and for `copy`
  `kind:"value"` on a secret). Decidable: *bucket or omit for secrets?* Omit.

**T-7. Error `message`/`reason` fields: `safe` vs. fixed enum.**
- **X (implicit).** `render.error.message`, `fetch.error.message`, `readError.reason` are tagged
  `safe` and carry the diagnostic string.
- **R:** hosts want the diagnostic for debugging.
- **A:** thrown strings echo the input (value substring, URL-with-value, sensitive filename) —
  an undeclared content channel bypassing `unsafeIncludeContent`, tagged `safe` so the host logs
  it.
- **C:** §5.
- **P:** carry a **fixed reason enum**, never the raw string; raw diagnostic to console only;
  `fetch.*` tagged `network`. Decidable: *free-form message or enum?* Enum.

**T-8. `allow` reducer: `?? true` vs. allowlist-closed.**
- **X:** `allow` defaults all-true, disabling a key removes a path (handoff #7).
- **R:** ergonomic default; restriction is monotonic.
- **A:** the naive `allow.url ?? true` means a partial `allow={{paste:true}}` leaves url/fetch
  live — a host that thinks it locked down still has SSRF open.
- **C:** §5 (restrict-only monotonicity).
- **P:** a **present** `allow` object is allowlist-closed (unlisted = OFF); only an **absent**
  prop is all-on. Decidable: *is a present-but-partial `allow` open or closed on unlisted keys?*
  Closed.

**T-9. `*.step` streaming during a live ceremony: emit vs. suppress.**
- **X:** `voice.step`/`walk.step` fire on `onEvent` as `safe` (grid address / feature-kind)
  (handoff #4).
- **R:** telemetry over the whole journey; the address is a coordinate, not a glyph.
- **A:** the *ordered sequence* is the live selection; relaying it to a counterparty re-opens the
  steering channel §15.9 removed by construction; §15.7 says the evidence is local-only.
- **C:** §14.2, §15.3, §15.7.
- **P:** **suppress `voice.step` (and live-ceremony `walk.step`) from `onEvent` entirely**; the
  check-order never leaves the endpoint. Single-user machine walk may emit `index` only.
  Decidable: *does the live check-order ever leave the local endpoint?* Never.

**T-10. `data-*` passthrough filter: blocklist vs. allowlist.**
- **X:** filter passthrough by excluding `on*`/`href`/`style`-on-SVG (handoff #12).
- **R:** escape hatch for host integration/testing/analytics selectors.
- **A:** a blocklist fails open on the next dangerous attribute (`xlink:href`, `formaction`,
  `srcdoc`, `is=`, data-URI `style`), re-introducing the `Entviz.ts:41–51` XSS/overlay vector.
- **C:** `Entviz.ts:41–51`; pill-design §2 (closed profile).
- **P:** **allowlist** `^(data-[a-z0-9-]+|aria-[a-z]+|id|role|title)$`, string values only, chrome
  root only, asserted-never-on-SVG. Decidable: *allowlist or blocklist?* Allowlist.

**T-11 (lowest). Headless scriptability via `open` + provided `reference`.**
- **X:** controlled `open`/`disclosure.change` + `verdict.change` is safe because disclosure is
  recognition-only and the gate needs a supplied reference (handoff #11).
- **R:** controlled disclosure is standard React DevX.
- **A:** it makes the attacker-chosen-reference journey fully automatable/observable (auto-open →
  inject ref → read verdict), easing the F-8 social-engineering path; provenance isn't enforced to
  render under host control.
- **C:** §2.4; F-8.
- **P:** provenance chrome + §2.4 scoping copy render **regardless** of controlled state;
  `verdict.change` carries `provenance` so telemetry records "against a provided ref." Decidable:
  *may controlling `open` suppress provenance?* No.

---

## 4. Anything the designer failed to flag

1. **Error-message content channel (T-7 / §2B).** The single biggest un-flagged leak:
   `render.error.message` / `fetch.error.message` / `reference.readError.reason` carry
   value-derived strings, tagged `safe`, bypassing the `unsafeIncludeContent` door. Not mentioned
   in §5's twelve claims.

2. **`copy` `byteLength` on a secret value (§2B).** The pill's `copy` event re-introduces a
   value-derived quantity (length oracle) that §3.3 spent its budget removing from the pill. The
   designer flagged `byteLength` for `reference.acquired` (#2) but not for `copy`.

3. **`onFetch` current-code reality (§1, T-1).** The proposal cites `fetchHint` as if
   origin-before-fetch is enforced; the code (`311–316`) shows a bare credentialed
   `fetch(refContent)` with origin only *displayed*. The proposal builds on a gate that isn't a
   gate. Not flagged.

4. **`maxSensitivity` host cap is missing.** The proposal gives the host a `sensitivity` *tag* to
   filter on but no in-component *cap* — so a policy-bound host cannot prevent `content`/beacon
   events from ever reaching its logger; it can only filter after receipt (too late; the payload
   already crossed the boundary into host code that may auto-forward). A hard in-component cap is
   the missing control.

5. **Cross-origin redirect slips the origin gate.** Even a consent-gated fetch to
   `https://trusted.tld` that 302-redirects to `http://169.254.169.254/…` defeats
   origin-before-fetch unless `redirect:"error"` (or re-consent) is set. Neither the code nor the
   proposal addresses redirect handling.

6. **`detectMedium` polyglot up-classification via a host fetcher (§6.2 / F-7).** A host
   `fetchReference` that returns attacker-chosen bytes feeds `detectMedium` + `classifyResult`
   (`70–91`); §6.2 requires fail-closed on ambiguity and strict closed-profile validation *before*
   value extraction. The proposal asserts "re-classified fail-closed" but does not require the
   injected-fetcher path to run the §6.2 validation gauntlet — a near-conformant SVG returned by a
   host fetcher must be routed through the same strict validation, not trusted because "the host
   fetched it." Flag this as a test requirement: injected-fetcher bytes get *identical* §6.2
   treatment to pasted bytes.

---

*End of adversarial review.*
