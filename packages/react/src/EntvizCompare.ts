/**
 * <EntvizCompare /> — helps a human decide whether THEIR value matches a
 * REFERENCE, by comparing entviz visualizations. Milestone 1b: the machine
 * "I have something to check against" flow for a **value** or **entviz-SVG**
 * reference, acquired by paste / file-pick / drag-drop / URL-fetch. The raster
 * engine, the guided human walk, and the two-party live ceremony come later.
 *
 * Security discipline (packages/react/docs/comparison-design.md): the affirmative
 * `=` is shown ONLY for a machine `identical` verdict (§3); `unknown` ("couldn't
 * read the reference") is surfaced distinctly from `different`; the reference is
 * always re-rendered through OUR pinned font (the pasted SVG is never embedded);
 * provenance is first-class and a URL's origin is shown before any fetch (§5);
 * and a green verdict means "equal to THIS reference", never "this reference is
 * trustworthy" (§2.4). Authored with React.createElement (no JSX).
 */
import {
  createElement as h,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { compareComparisonText, compareSvg, compareValues, describeChannels, detectMedium, rasterCompare, type Raster, type RenderOptions, type Verdict, type WalkStep } from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { EntvizWalk, layoutStyle, ringOverlay, figureBox, type EntvizLayout } from "./EntvizWalk.ts";
import { EntvizVoiceCompare } from "./EntvizVoiceCompare.ts";
import { fmt, isRtlLocale } from "./pill-messages.ts";
import { defaultCompareMessages, type CompareMessages } from "./compare-messages.ts";
import { emitEvent, type EntvizEvent, type EntvizEventInit, type Medium, type VerdictState } from "./events.ts";
import { TEXT } from "./text-scale.ts";

export interface EntvizCompareProps {
  // --- the user's own value + its render inputs (deterministic) ---
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  // --- a reference supplied by the host (M1b: a text value or entviz SVG) ---
  reference?: { kind: "text" | "svg"; data: string };
  /** Reserved for the deferred guided walk; accepted but unused in M1a/M1b. */
  confidence?: "quick" | "strong" | "paranoid";
  // --- chrome ---
  /** Panel arrangement: "side-by-side" (default — the two figures sit next to
   *  each other so a comparison is a saccade, not a scroll), "stacked" (one above
   *  the other), or "auto" (side-by-side, wrapping to stacked when too narrow). */
  layout?: EntvizLayout;
  locale?: string;
  messages?: Partial<CompareMessages>;
  /** ALLOWLIST-CLOSED, restrict-only. When ABSENT, all four acquisition methods
   *  are ON (today's behavior). When PRESENT, a method is enabled ONLY if its key
   *  is exactly `true`; any missing/false/undefined key is OFF. So
   *  `allow={{paste:true}}` disables file, url, and drop. This is a light DLP /
   *  host-policy convenience (least acquisition surface) — NOT the primary asset
   *  (`secret.detected`-style hygiene). NEVER `allow.x ?? true`: that would leave a
   *  method live when the host thought it locked it down. */
  allow?: { paste?: boolean; file?: boolean; url?: boolean; drop?: boolean };
  /** A light convenience: when true, `reference.acquired` carries `content` (the
   *  raw reference bytes). OFF by default so a pasted-secret corner case isn't
   *  ambiently logged. Confidentiality is OUT of scope — values are public — so
   *  this is hygiene, not a security firewall; nothing else is gated on it. */
  includeContent?: boolean;
  /** Host-injected URL fetcher (proxy/auth/CORS/tests). When provided, the URL
   *  path calls THIS instead of the built-in `fetch`. Integrity guard (§4/§5.8):
   *  the returned bytes are attacker-authorable and flow through the SAME
   *  `classifyResult`/`compareSvg` §6.2 gauntlet as pasted bytes — the fetcher
   *  supplies BYTES, never a verdict, and cannot mark a reference identical.
   *  `{ text }` sets text/svg content; `{ blob }` is read to a data URL (raster). */
  fetchReference?: (
    url: string,
    ctx: { origin: string; signal: AbortSignal },
  ) => Promise<{ text: string } | { blob: Blob }>;
  onVerdict?: (v: Verdict) => void;
  /** The typed event firehose (see events.ts). Notify-only, in addition to the
   *  specific callbacks; only `fetch.start` is advisory-cancelable. */
  onEvent?: (e: EntvizEvent) => void;
  /** A [0,1) source for the unpredictable check ORDER, threaded down to the
   *  <EntvizWalk> / <EntvizVoiceCompare> this launches — the platform CSPRNG by
   *  default; a seeded source in tests/repro demos. PROD GATE (§5.4): each child
   *  re-gates via `safeRng`, so a prod bundle always uses the platform CSPRNG
   *  regardless of an injected `rng` and a predictable order can't be shipped. */
  rng?: () => number;
  className?: string;
  style?: CSSProperties;
}

export type CompareResult =
  | { kind: "pending" }
  // `refValue` is the value to RENDER as the reference figure, or null when we
  // can't draw it (e.g. a comparison-text reference that didn't match).
  | { kind: "verdict"; verdict: Verdict; refValue?: string | null }
  | { kind: "deferred"; medium: "raster" }
  | { kind: "ambiguous" };

type Provenance = "pasted" | "file" | "url" | "dropped" | "provided";

// Comparison text is space-separated cells (blanks as U+00B7); a plain value is a
// lone token. Used only to decide whether to RENDER an unmatched reference — the
// verdict itself comes from trying both engines.
const looksLikeComparisonText = (s: string): boolean => /·/.test(s) || /\s/.test(s.trim());

/** Pure: route an acquired reference to a machine result (no DOM, unit-tested). */
export function classifyResult(value: string, refContent: string, opts: RenderOptions = {}): CompareResult {
  if (!refContent.trim()) return { kind: "pending" };
  const medium = detectMedium(refContent);
  if (medium === "text") {
    // A pasted VALUE is definitive and renderable, so it wins. If it doesn't match,
    // the text may be COMPARISON TEXT (the "Copy comparison text" output) of our
    // value — compare that too. A comparison-text match can't reconstruct the
    // reference, so we render OUR figure (it's the same value); a comparison-text
    // MISMATCH can't be drawn at all.
    const asValue = compareValues(value, refContent);
    if (asValue.state === "identical") return { kind: "verdict", verdict: asValue, refValue: refContent };
    const asCmp = compareComparisonText(refContent, value, opts);
    if (asCmp.state !== "different") return { kind: "verdict", verdict: asCmp, refValue: value };
    return { kind: "verdict", verdict: asValue, refValue: looksLikeComparisonText(refContent) ? null : refContent };
  }
  if (medium === "svg") {
    const verdict = compareSvg(refContent, value, opts);
    return { kind: "verdict", verdict, refValue: verdict.state === "identical" ? value : null };
  }
  if (medium === "raster") return { kind: "deferred", medium };
  return { kind: "ambiguous" };
}

/** Heuristic "is this secret key material?" so we can warn before it's pasted in
 *  (confidentiality is out of scope — comparison-design.md §5). */
export function looksLikeSecret(s: string): boolean {
  const t = s.trim();
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(t)) return true;
  if (/\b(xprv|xpriv|tprv)[0-9A-Za-z]{50,}\b/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w))) return true;
  return false;
}

/** Read a dropped/picked file: SVG/text as text (so it routes to the SVG/text
 *  engine), other images as a data URL (→ the deferred raster engine). */
export function readFileAsReference(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read failed"));
    fr.onload = () => resolve(String(fr.result));
    if (/^image\//i.test(file.type) && !/svg/i.test(file.type)) fr.readAsDataURL(file);
    else fr.readAsText(file);
  });
}

/** Read a host-fetcher `{ blob }` to a data URL so it routes to the raster engine
 *  (the same path a pasted/dropped screenshot takes) — never `identical`. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read failed"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function imageToRaster(img: HTMLImageElement, w: number, h: number): Raster {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, w, h);
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * Raster path: decode the reference image to RGBA and hand it to the core
 * geometry-anchored engine (comparison-design.md §6.3), which locates the entviz
 * in the image and samples predicted feature colors. Never `identical`. We do NOT
 * rasterize our own SVG — the engine reads the image against the render model.
 */
export async function compareRaster(refSrc: string, value: string, opts: RenderOptions = {}): Promise<Verdict> {
  const refImg = await loadImage(refSrc);
  const w = refImg.naturalWidth || 1;
  const h = refImg.naturalHeight || 1;
  return rasterCompare(imageToRaster(refImg, w, h), value, opts);
}

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

interface Chip {
  symbol: string;
  label: string;
  tone: "good" | "bad" | "warn" | "neutral";
}

function chipFor(result: CompareResult, m: CompareMessages): Chip {
  switch (result.kind) {
    case "pending":
      return { symbol: "?", label: m.pending, tone: "neutral" };
    case "ambiguous":
      return { symbol: "?", label: m.unknownAmbiguous, tone: "warn" };
    case "deferred":
      return { symbol: "…", label: m.unknownRaster, tone: "neutral" };
    default: {
      // The engines (compareValues / compareSvg) return only these three states.
      const v = result.verdict as Exclude<Verdict, { state: "pending" }>;
      if (v.state === "identical") return { symbol: "=", label: m.identical, tone: "good" };
      if (v.state === "different") return { symbol: "≠", label: m.different, tone: "bad" };
      // A raster look-alike: pixels matched but text can't be read from an image.
      if (v.state === "unknown" && v.similar) return { symbol: "≈", label: m.unknownRasterSimilar, tone: "warn" };
      // unknown (e.g. a >512-bit or non-self-consistent SVG reference)
      return { symbol: "?", label: fmt(m.unknownReason, { reason: v.reason }), tone: "warn" };
    }
  }
}

function provenanceLabel(p: Provenance, origin: string, m: CompareMessages): string {
  switch (p) {
    case "pasted": return m.provenancePasted;
    case "file": return m.provenanceFile;
    case "dropped": return m.provenanceDropped;
    case "provided": return m.provenanceProvided;
    default: return fmt(m.provenanceUrl, { origin }); // "url"
  }
}

const TONE: Record<Chip["tone"], string> = {
  good: "var(--entviz-compare-good, #1a7f37)",
  bad: "var(--entviz-compare-bad, #c4314b)",
  warn: "var(--entviz-compare-warn, #9a6700)",
  neutral: "var(--entviz-compare-neutral, #57606a)",
};

// The VERDICT chip's colors are FIXED, self-contained literals — never the host-themeable
// `--entviz-compare-*` vars — so ambient/host CSS (threat-model T2: "controls the rendering
// surface") cannot recolor a verdict (e.g. paint a "≠ Different" chip verdict-green). A solid
// fill + white ink stays legible on any host background, and color is only a REDUNDANT cue
// here: the symbol (=/≠) and the label text are the primary, non-recolorable channels.
// (The themeable TONE var above is kept only for non-verdict chrome, e.g. the fetch-error hint.)
const VERDICT_SKIN: Record<Chip["tone"], { bg: string; fg: string }> = {
  good: { bg: "#1a7f37", fg: "#ffffff" },
  bad: { bg: "#c4314b", fg: "#ffffff" },
  warn: { bg: "#9a6700", fg: "#ffffff" },
  neutral: { bg: "#57606a", fg: "#ffffff" },
};

// Strings that carry the security JUDGMENT (the verdict, its scoping caveat, provenance) are
// NOT host-overridable via `messages` — only surrounding chrome is localizable. Re-pinned in
// EntvizCompare() after the override merge.
const VERDICT_LOCKED_KEYS: (keyof CompareMessages)[] = [
  "identical", "different", "unknownAmbiguous", "unknownRaster", "unknownRasterSimilar",
  "unknownReason", "pending", "machineCheck", "recognitionNote",
  "provenancePasted", "provenanceFile", "provenanceUrl", "provenanceDropped", "provenanceProvided",
];

/** Map the internal machine result to the firehose's coarse `VerdictState`
 *  (pending/deferred → "pending"; ambiguous → "unknown"; a real verdict passes
 *  its own state through, all of which are valid VerdictStates). */
function verdictStateOf(result: CompareResult): VerdictState {
  if (result.kind === "verdict") return result.verdict.state as VerdictState;
  if (result.kind === "ambiguous") return "unknown";
  return "pending"; // pending | deferred (raster still decoding)
}

export function EntvizCompare(props: EntvizCompareProps): ReactNode {
  const { value, targetAr, fontSizePt, note, reference, layout = "side-by-side", locale, messages: overrides, allow, includeContent, fetchReference, onVerdict, onEvent, rng, className, style } = props;
  // ALLOWLIST-CLOSED acquisition gate (§5.10): an ABSENT `allow` is all-on;
  // a PRESENT `allow` enables a method ONLY on an explicit `=== true`. Never
  // `allow[m] ?? true` — that fails OPEN, leaving a method live the host thought
  // it disabled. This mirrors the DLP/policy hygiene of `secret.detected`: a
  // restrict-only least-surface control, not the primary (equality-belief) asset.
  const allowPaste = allow ? allow.paste === true : true;
  const allowFile = allow ? allow.file === true : true;
  const allowUrl = allow ? allow.url === true : true;
  const allowDrop = allow ? allow.drop === true : true;
  // The event firehose: a monotonic seq per instance, and a bound `emit` that
  // stamps source="compare" and swallows a throwing host handler (events.ts).
  const seqRef = useRef(0);
  const emit = (init: EntvizEventInit) => emitEvent(onEvent, "compare", seqRef, init);
  // Monotonic step index for walk.step, reset when a walk launches.
  const walkStepIndexRef = useRef(0);
  // Merge host `messages`, then RE-PIN the verdict-, scoping-, and provenance-bearing strings
  // to the defaults. A host override may localize surrounding chrome, but must NOT relabel a
  // verdict ("Different" → "Match"), soften the recognition≠verification scoping, or rewrite
  // provenance — that is judgment-tamper against the primary asset (threat-model: the user's
  // equality belief), not localization.
  const m: CompareMessages = { ...defaultCompareMessages, ...overrides };
  for (const k of VERDICT_LOCKED_KEYS) m[k] = defaultCompareMessages[k];
  const rtl = isRtlLocale(locale ?? "");
  const panelsStyle = layoutStyle(layout);
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);

  const [ref, setRef] = useState<{ content: string; provenance: Provenance; origin: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // null = not walking (show the two entry buttons); otherwise the chosen mode.
  const [walkMode, setWalkMode] = useState<"spot-check" | "complete" | null>(null);
  const walking = walkMode !== null;
  // The two situational choices (§15.8) are tabs: the reference/machine comparison
  // and the live voice ceremony.
  const [tab, setTab] = useState<"reference" | "voice">("reference");
  // The feature the guided walk is currently checking — the walk reports it (it
  // runs with externalFigures), and we ring it on OUR static figures (#reuse).
  const [walkStep, setWalkStep] = useState<WalkStep | null>(null);
  // One file input (rendered once, always attached) that the empty reference rect
  // triggers via htmlFor — so "click the rect to upload" works and survives a
  // re-pick, and the rect stays a drop target too.
  const fileInputId = useId();

  // Shared display size/shape (#3): the resize/reshape controls live on OUR
  // figure and drive BOTH panels. Initialized from the host's render inputs.
  const [dispFs, setDispFs] = useState(fontSizePt ?? 12);
  const [dispAr, setDispAr] = useState(targetAr ?? 1);
  const dispOpts = { targetAr: dispAr, fontSizePt: dispFs, note };

  // Describe OUR value once per (value, size, shape) — used for both the
  // placeholder footprint and the walk's focus ring, so stepping through a walk
  // doesn't rebuild the model every render.
  const ourModel = useMemo(() => {
    try { return describeChannels(value, dispOpts); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dispAr, dispFs, note]);
  // A small value (≤6 filled cells) offers only Complete — a spot-check of a
  // handful of cells is degenerate (§14.4).
  const small = Boolean(ourModel) && !ourModel!.truncated && ourModel!.cells.filter((c) => !c.blank).length <= 6;

  // The empty reference placeholder matches OUR figure's footprint exactly (the
  // render model's viewBox W×H at the live size/shape), so the two boxes are the
  // same size side-by-side; fall back to a default if the value can't be measured.
  const placeholderSize = ourModel
    ? (() => {
        const [, , w, hh] = ourModel.geometry.viewBox.split(/\s+/).map(Number);
        return { width: w, height: hh };
      })()
    : { width: 180, height: 120 };

  const provided = reference ? { content: reference.data, provenance: "provided" as Provenance, origin: "" } : null;
  const eff = provided ?? ref;
  const refContent = eff?.content ?? "";

  const medium = refContent.trim() ? detectMedium(refContent) : null;
  // A pasted URL is detected in the SAME field (no separate URL box): it's
  // "ambiguous" to the medium detector but parses as a URL, so we offer to fetch
  // it (origin shown first, never auto-fetched — §5).
  const refOrigin = originOf(refContent);
  // `url` off (allowlist-closed): even a pasted URL is treated as ambiguous — no
  // Fetch button / URL-ready chip is offered, so no egress path is opened.
  const isUrl = allowUrl && medium === "ambiguous" && !!refOrigin;
  const baseResult = useMemo(() => classifyResult(value, refContent, opts), [value, refContent, opts]);

  // Raster comparison is async (decode the image, render ours, disprove); the
  // sync classifier marks it `deferred` and this effect fills in the verdict.
  const [rasterV, setRasterV] = useState<Verdict | null>(null);
  useEffect(() => {
    if (medium !== "raster") { setRasterV(null); return; }
    let alive = true;
    setRasterV(null);
    compareRaster(refContent, value, opts).then(
      (v) => { if (alive) setRasterV(v); },
      () => {
        if (!alive) return;
        emit({ type: "reference.readError", reason: "could not read the reference image" });
        setRasterV({ state: "unknown", reason: "could not read the reference image" });
      },
    );
    return () => { alive = false; };
  }, [medium, refContent, value, opts]);

  const result: CompareResult =
    baseResult.kind === "deferred" && rasterV ? { kind: "verdict", verdict: rasterV } : baseResult;
  useEffect(() => {
    if (result.kind === "verdict") onVerdict?.(result.verdict);
  }, [result, onVerdict]);

  // verdict.change (notify-only): fire when the effective verdict STATE transitions.
  const prevVerdictRef = useRef<VerdictState | null>(null);
  const effProvenance = eff?.provenance ?? null;
  useEffect(() => {
    const vs = verdictStateOf(result);
    if (vs !== prevVerdictRef.current) {
      emit({ type: "verdict.change", verdict: vs, medium: medium ?? null, provenance: effProvenance });
    }
    prevVerdictRef.current = vs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, medium, effProvenance]);

  const secret = looksLikeSecret(value) || looksLikeSecret(refContent);

  // --- event firehose: fire on TRANSITIONS only (prior-value refs), never
  //     re-emit unchanged state every render. ---

  // reference.acquired / reference.cleared: a reference becoming present / empty.
  // A change of provenance while still present (e.g. a pasted URL replaced by its
  // FETCHED body: pasted → url) is a fresh acquisition, so re-emit on that too.
  const hadRefRef = useRef(false);
  const prevProvenanceRef = useRef<Provenance | null>(null);
  useEffect(() => {
    const present = refContent.trim().length > 0;
    const prov = eff?.provenance ?? null;
    if (present && (!hadRefRef.current || prov !== prevProvenanceRef.current)) {
      emit({
        type: "reference.acquired",
        provenance: eff!.provenance,
        medium,
        byteLength: new TextEncoder().encode(eff!.content).length,
        origin: eff!.origin || undefined,
        // Content is a public value; withheld by default only so a pasted-secret
        // corner case isn't ambiently logged (includeContent = hygiene, not a firewall).
        ...(includeContent ? { content: eff!.content } : {}),
      });
    } else if (!present && hadRefRef.current) {
      emit({ type: "reference.cleared" });
    }
    hadRefRef.current = present;
    prevProvenanceRef.current = present ? prov : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refContent, medium]);

  // reference.mediumDetected: `medium` resolves to a concrete value.
  const prevMediumRef = useRef<Medium | null>(null);
  useEffect(() => {
    if (medium !== null && medium !== prevMediumRef.current) {
      emit({ type: "reference.mediumDetected", medium, isUrl });
    }
    prevMediumRef.current = medium;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medium, isUrl]);

  // secret.detected: `secret` flips true — report WHERE the secret shape was seen.
  const prevSecretRef = useRef(false);
  useEffect(() => {
    if (secret && !prevSecretRef.current) {
      const inValue = looksLikeSecret(value);
      const inRef = looksLikeSecret(refContent);
      const where = inValue && inRef ? "both" : inValue ? "value" : "reference";
      emit({ type: "secret.detected", where });
    }
    prevSecretRef.current = secret;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, value, refContent]);

  // A detected-but-unfetched URL isn't "couldn't recognize" — it's recognized,
  // just not loaded yet: show a neutral "fetch it" chip instead of the warning.
  const chip: Chip = isUrl
    ? { symbol: "↻", label: m.urlReady, tone: "neutral" }
    : chipFor(result, m);

  // The reference is ALWAYS re-rendered through our own <Entviz> (the pasted SVG is
  // never embedded). `refValue` (from classifyResult) is the value to draw: the
  // pasted value for a value reference, OUR value on an SVG/comparison-text match,
  // or null when it can't be drawn. Raster shows the image itself (handled below).
  const refDisplayValue = result.kind === "verdict" ? (result.refValue ?? null) : null;

  // Describe the reference once too (for its focus ring during a walk).
  const refModel = useMemo(() => {
    if (refDisplayValue === null) return null;
    try { return describeChannels(refDisplayValue, dispOpts); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDisplayValue, dispAr, dispFs, note]);

  const onPick = (file: File | undefined, provenance: Provenance) => {
    if (!file) return;
    setFetchError(null);
    readFileAsReference(file).then(
      (content) => setRef({ content, provenance, origin: "" }),
      () => {
        emit({ type: "reference.readError", reason: "read failed" });
        setFetchError("read failed");
      },
    );
  };

  const onFetch = async () => {
    setFetchError(null);
    // fetch.start is the one advisory-cancelable event: a host handler may call
    // preventDefault() to block egress (fail-closed — blocking can only deny). If
    // blocked, neither the built-in fetch NOR a host `fetchReference` runs.
    let blocked = false;
    emit({
      type: "fetch.start",
      origin: refOrigin,
      url: refContent,
      preventDefault: () => { blocked = true; },
      sensitivity: "network",
    });
    if (blocked) return;
    const startedAt = Date.now();
    try {
      // The bytes we set as the reference — supplied by the host fetcher OR the
      // built-in fetch. Either way they flow through the SAME classifyResult /
      // compareSvg §6.2 gauntlet as pasted bytes (via setRef → refContent): the
      // fetcher hands us BYTES, never a verdict, and CANNOT mark a reference
      // identical (§5.8). `{ text }` → text/svg classification; `{ blob }` → a data
      // URL → the raster engine (raster is never `identical`).
      let content: string;
      let byteLength: number;
      let status = 0;
      if (fetchReference) {
        // Origin is already shown before the user clicks Fetch (unchanged). Provide
        // an AbortSignal so a host fetcher can be cancelled on unmount/host policy.
        const controller = new AbortController();
        const out = await fetchReference(refContent, { origin: refOrigin, signal: controller.signal });
        if ("blob" in out) {
          content = await blobToDataUrl(out.blob);
          byteLength = out.blob.size;
        } else {
          content = out.text;
          byteLength = new TextEncoder().encode(content).length;
        }
      } else {
        const res = await fetch(refContent);
        content = await res.text();
        byteLength = new TextEncoder().encode(content).length;
        status = (res as { status?: number }).status ?? 0;
      }
      emit({
        type: "fetch.success",
        origin: refOrigin,
        status,
        byteLength,
        durationMs: Date.now() - startedAt,
        sensitivity: "network",
      });
      setRef({ content, provenance: "url", origin: refOrigin });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      emit({ type: "fetch.error", origin: refOrigin, message, sensitivity: "network" });
      setFetchError(message);
    }
  };

  // Display controls, wrapped to fire display.* events. resize/reshape drive
  // BOTH figures (one state), so the event is emitted once with the new size/shape.
  const onDispResize = (fontSizePt: number) => {
    emit({ type: "display.resize", fontSizePt });
    setDispFs(fontSizePt);
  };
  const onDispReshape = (nextAr: number) => {
    // cols/rows are required on display.reshape — derive them from OUR value at the
    // NEWLY chosen aspect ratio (describeChannels picks the grid). Fall back to the
    // current model's grid if the value can't be measured.
    let cols = ourModel?.cols ?? 0;
    let rows = ourModel?.rows ?? 0;
    try {
      const m2 = describeChannels(value, { targetAr: nextAr, fontSizePt: dispFs, note });
      cols = m2.cols;
      rows = m2.rows;
    } catch { /* keep the fallback grid */ }
    emit({ type: "display.reshape", targetAr: nextAr, cols, rows });
    setDispAr(nextAr);
  };
  const onSetTab = (t: "reference" | "voice") => {
    emit({ type: "display.tab", tab: t });
    setTab(t);
  };
  const onSetWalkMode = (mode: "spot-check" | "complete") => {
    walkStepIndexRef.current = 0;
    emit({ type: "walk.start", mode });
    setWalkMode(mode);
  };
  // The walk reports the current WalkStep (or null when it clears/ends). We forward
  // it as walk.step with the feature KIND (never glyph text — comparison-design
  // §14.2) and a monotonic index; the walk here is single-user so walk.step is
  // allowed (a live ceremony never emits *.step — events.ts module doc).
  const onWalkStep = (step: WalkStep | null) => {
    if (step) emit({ type: "walk.step", feature: step.kind, index: walkStepIndexRef.current++ });
    setWalkStep(step);
  };

  // The reference file input, rendered once (hidden). The empty reference rect is
  // a <label htmlFor> that opens it (click-the-rect-to-upload); it also stays a
  // drop target. Not offered for a controlled/provided reference, nor when `file`
  // is disabled by the allowlist (then the empty rect is not an upload control).
  const fileInput = provided || !allowFile
    ? null
    : h("input", {
        type: "file", id: fileInputId, accept: ".svg,image/svg+xml,image/*",
        "aria-label": m.pickFile,
        onChange: (e: { target: { files: FileList | null } }) => onPick(e.target.files?.[0], "file"),
        style: { display: "none" },
      });

  // One full-width acquisition field (#4/#5): paste a value, an entviz SVG, or a
  // URL — all into the same box (file upload lives in the reference rect, below).
  // A pasted URL is auto-detected and offered for fetch (origin shown first).
  // Hidden during a walk (no mid-walk reference edits) and for a controlled reference.
  const acquisition = provided || walking
    ? null
    : h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6, width: "100%" } },
        h(
          "div",
          { style: { display: "flex", gap: 6, alignItems: "flex-start", width: "100%" } },
          h("textarea", {
            // `paste` off (allowlist-closed): the field is readOnly so no value can
            // be entered — the acquisition textarea is effectively not offered.
            readOnly: !allowPaste,
            // A raster reference (pasted/dropped/picked image) shows an "[image]"
            // marker rather than its data URL; a pasted text value shows itself.
            value: medium === "raster" ? m.imagePasted : eff?.provenance === "pasted" ? refContent : "",
            // Editing over the marker drops it, so typing replaces the image with text.
            onChange: (e: { target: { value: string } }) => {
              if (!allowPaste) return;
              setRef({ content: e.target.value.replace(m.imagePasted, ""), provenance: "pasted", origin: "" });
            },
            // A pasted raster image (screenshot) becomes the reference — read it as
            // a file (data URL → raster engine) instead of the default text paste.
            onPaste: (e: {
              preventDefault: () => void;
              clipboardData: { files: FileList | File[] };
            }) => {
              if (!allowPaste) return;
              const img = [...(e.clipboardData?.files ?? [])].find(
                (f) => /^image\//i.test(f.type) && !/svg/i.test(f.type),
              );
              if (img) { e.preventDefault(); onPick(img, "pasted"); }
            },
            "aria-label": m.pastePrompt,
            placeholder: m.pastePrompt,
            spellCheck: false,
            autoComplete: "off",
            rows: 2,
            style: textareaStyle,
          }),
          isUrl
            ? h("button", { type: "button", onClick: onFetch, style: fetchBtn }, m.fetchButton)
            : null,
        ),
        isUrl ? h("span", { style: hint }, fmt(m.fetchHint, { origin: refOrigin })) : null,
        fetchError ? h("span", { role: "alert", style: { ...hint, color: TONE.bad } }, fmt(m.fetchError, { error: fetchError })) : null,
      );

  // The reference/machine comparison tab: the two figures, the acquisition field,
  // the machine verdict chip, and the guided-walk launch.
  const referenceTab = h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 10 } },
    fileInput,
    h(
      "div",
      { style: panelsStyle, "data-entviz-layout": layout },
      // Yours — carries the shared size/reshape controls (drives both panels).
      // During a walk the controls are suppressed and the bare figure goes in a
      // figureBox so the focus ring overlays cleanly. NOTE: figureBox zeroes the
      // font/line box (to kill the inline-svg gap), so it must wrap ONLY the bare
      // figure — never the controls (their button text would vanish).
      h(
        "div",
        { style: panelStyle },
        h("span", { style: panelLabel }, m.yours),
        walking
          ? h(
              "div",
              { style: figureBox },
              h(Entviz, { value, targetAr: dispAr, fontSizePt: dispFs, note, style: figureFill }),
              walkStep ? ringOverlay(ourModel, walkStep, "yours") : null,
            )
          : h(Entviz, {
              value, targetAr: dispAr, fontSizePt: dispFs, note,
              controls: true, reshapable: medium !== "raster",
              onResize: onDispResize, onReshape: onDispReshape,
            }),
      ),
      // Reference — re-rendered at the same shared size/shape; no controls. The
      // figure (or a drop-target slot of the same footprint) sits directly under
      // the label, horizontally level with "Yours" for line-of-sight comparison.
      h(
        "div",
        { style: panelStyle },
        h("span", { style: panelLabel }, m.reference),
        medium === "raster"
          ? h(
              "div",
              { style: figureBox },
              h("img", { src: refContent, alt: m.imageAlt, style: { ...placeholderSize, ...rasterRefStyle } }),
              walking && walkStep ? ringOverlay(ourModel, walkStep, "reference") : null,
            )
          : refDisplayValue === null
          // empty slot, sized to OUR figure's footprint — doubles as the drop target
          // (the "Reference" label above already says what it is, so the copy is just
          // the drop hint; #3).
          // The empty slot IS the upload control: a <label> for the hidden file
          // input (click to choose), carrying an upload glyph + the drop hint. It
          // still receives drops via the root onDrop.
          ? emptyReferenceSlot({
              allowFile, allowDrop, fileInputId, m,
              boxStyle: { ...placeholderBox, ...placeholderSize },
            })
          : walking
            ? h(
                "div",
                { style: figureBox },
                h(Entviz, { value: refDisplayValue, targetAr: dispAr, fontSizePt: dispFs, note, style: figureFill }),
                walkStep ? ringOverlay(refModel, walkStep, "reference") : null,
              )
            : h(Entviz, { value: refDisplayValue, targetAr: dispAr, fontSizePt: dispFs, note, style: figureCell }),
        eff && refContent.trim()
          ? h("span", { style: provenance }, provenanceLabel(eff.provenance, eff.origin, m))
          : null,
      ),
    ),
    // The acquisition field spans the WHOLE comparator, below both figures (#5).
    acquisition,
    // The machine verdict chip — omitted while merely pending (that pill just
    // restated the input's own placeholder; #3). Shown for a URL-ready hint and
    // every real verdict.
    isUrl || result.kind !== "pending"
      ? h(
          "span",
          { role: "status", "aria-live": "polite", style: { ...chipStyle, background: VERDICT_SKIN[chip.tone].bg, color: VERDICT_SKIN[chip.tone].fg, borderColor: "transparent" } },
          !isUrl ? h("span", { style: machineCheckLabel }, m.machineCheck) : null,
          h("span", { "aria-hidden": true, style: { fontWeight: 700, fontSize: TEXT.body } }, chip.symbol),
          h("span", null, chip.label),
        )
      : null,
    // §2.4 scoping caveat on the MACHINE chip too (not just the walk/voice paths): a match
    // means "equal to THIS reference", never that the reference is the one to trust. Shown
    // for every non-"different" verdict (identical/unknown) — the fastest, most-trusted
    // outcomes. Locked string (not host-overridable).
    result.kind === "verdict" && result.verdict.state !== "different"
      ? h("span", { style: scopingNote }, m.recognitionNote)
      : null,
    // Guided-walk launch (M2): a value reference walks value-vs-value; a raster
    // reference walks OUR figure against the pasted image by eye. Only offered when
    // there's a renderable reference (a value / a matched comparison text) or a raster.
    ((medium === "text" && refDisplayValue) || medium === "raster") && refContent.trim()
      ? walking
        ? h(EntvizWalk, {
            value,
            reference: medium === "raster" ? "" : (refDisplayValue ?? ""),
            targetAr: dispAr, fontSizePt: dispFs, note, layout,
            mode: walkMode!, // launch straight into the chosen mode
            externalFigures: true, // reuse our static figures; just report the step
            rng, // threaded down; EntvizWalk re-gates via safeRng (§5.4)
            onStep: onWalkStep,
            // The core walk status "pending" (a Done at a sub-Good peek) maps to the
            // event union's "pending-done"; the other three pass straight through.
            onComplete: (status) => {
              emit({ type: "walk.complete", status: status === "pending" ? "pending-done" : status });
              setWalkStep(null);
            },
            style: { marginTop: 4 },
          })
        : h(
            "div",
            { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            small || medium === "raster"
              ? null
              : h("button", { type: "button", onClick: () => onSetWalkMode("spot-check"), title: m.walkSpotCheckHint, style: walkLaunchStyle }, m.walkSpotCheck),
            h("button", { type: "button", onClick: () => onSetWalkMode("complete"), title: m.walkCompleteHint, style: walkLaunchStyle }, m.walkComplete),
          )
      : null,
  );

  // The voice tab: the live ceremony. paste-bind when a text reference already
  // machine-matched as identical (they transmitted their value and it matched);
  // otherwise voice-only (they read their own copy aloud).
  const canPasteBind = medium === "text" && result.kind === "verdict" && result.verdict.state === "identical";
  const voiceTab = h(EntvizVoiceCompare, {
    value, targetAr: dispAr, fontSizePt: dispFs, note,
    mode: canPasteBind ? "paste-bind" : "voice-only", layout,
    rng, // threaded down; EntvizVoiceCompare re-gates via safeRng (§5.4)
    // voice.complete forwards the ceremony outcome. No voice.start / voice.step —
    // the live check-order must never leave the endpoint (events.ts module doc).
    onComplete: (status) => emit({ type: "voice.complete", status }),
  });

  const tabButton = (key: "reference" | "voice", label: string, icon: ReactNode): ReactNode =>
    h(
      "button",
      {
        type: "button", role: "tab", "aria-selected": tab === key,
        onClick: () => onSetTab(key), style: tab === key ? tabActive : tabInactive,
      },
      icon,
      h("span", null, label),
    );

  return h(
    "div",
    {
      dir: rtl ? "rtl" : undefined,
      className,
      // `drop` off (allowlist-closed): the root onDrop/onDragOver are no-ops, so a
      // dragged file/value can't become a reference by this path.
      onDragOver: provided || !allowDrop ? undefined : (e: { preventDefault: () => void }) => e.preventDefault(),
      onDrop: provided || !allowDrop
        ? undefined
        : (e: { preventDefault: () => void; dataTransfer: DataTransfer }) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) onPick(file, "dropped");
            else {
              const text = e.dataTransfer.getData("text");
              if (text) setRef({ content: text, provenance: "dropped", origin: "" });
            }
          },
      style: { display: "inline-flex", flexDirection: "column", gap: 10, font: "inherit", ...style },
    },
    // Two situational choices as tabs (§15.8). A host-provided reference isn't
    // interactive, so it renders the comparison directly under a plain heading.
    provided
      ? h("strong", { style: { fontSize: TEXT.body } }, m.heading)
      : h(
          "div",
          { role: "tablist", style: tabBarStyle },
          tabButton("reference", m.heading, null),
          tabButton("voice", m.voiceLaunch, personSpeakingIcon()),
        ),
    secret ? h("span", { role: "alert", style: warnBanner }, m.secretWarning) : null,
    !provided && tab === "voice" ? voiceTab : referenceTab,
  );
}

/** The empty reference slot, adapted to the allowlist:
 *  - file ON  → a <label> upload control (click-to-choose) that is also a drop target;
 *  - file OFF, drop ON → a plain <div> with only a drop hint (no upload affordance);
 *  - file OFF, drop OFF → a plain, non-interactive placeholder (paste-only host).
 *  Never a <label> when file is off (nothing to open), so the host's DLP/policy
 *  lock-down is visible in the UI, not just wired behind it. */
function emptyReferenceSlot(o: {
  allowFile: boolean;
  allowDrop: boolean;
  fileInputId: string;
  m: CompareMessages;
  boxStyle: CSSProperties;
}): ReactNode {
  const { allowFile, allowDrop, fileInputId, m, boxStyle } = o;
  const uploadGlyph = h(
    "svg",
    {
      "aria-hidden": true, width: "1.7em", height: "1.7em", viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", strokeWidth: 2,
      strokeLinecap: "round", strokeLinejoin: "round", style: { display: "block", opacity: 0.75, marginBottom: 4 },
    },
    h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    h("polyline", { points: "17 8 12 3 7 8" }),
    h("line", { x1: 12, y1: 3, x2: 12, y2: 15 }),
  );
  if (allowFile) {
    return h("label", { htmlFor: fileInputId, style: { ...boxStyle, cursor: "pointer" } }, uploadGlyph, m.dropHint);
  }
  // No file upload: a plain div. If drop is on, keep the drop hint; otherwise a
  // fully non-interactive placeholder (default cursor, no upload copy).
  return h(
    "div",
    { style: { ...boxStyle, cursor: "default" } },
    allowDrop ? m.dropOnlyHint : m.placeholderHint,
  );
}

// A person with speech waves (a person *speaking*, not a bare speaker — §15.8),
// inline-SVG in currentColor so there's no icon-library dependency.
function personSpeakingIcon(): ReactNode {
  return h(
    "svg",
    {
      "aria-hidden": true, width: "1.1em", height: "1.1em", viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", strokeWidth: 2,
      strokeLinecap: "round", strokeLinejoin: "round", style: { display: "block" },
    },
    h("circle", { cx: 8.5, cy: 7, r: 3 }),
    h("path", { d: "M3 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 3.5 1.5" }),
    h("path", { d: "M16.5 8a4 4 0 0 1 0 6" }),
    h("path", { d: "M19 5.5a7 7 0 0 1 0 11" }),
  );
}

// The two situational-choice tabs (§15.8): a bottom-bordered tab strip; the active
// tab is underlined in the action color, the inactive one muted.
const tabBarStyle: CSSProperties = {
  display: "flex", gap: 4, borderBottom: "1px solid var(--entviz-compare-placeholder, #d0d7de)",
};
// Uses longhand font-/border-bottom- properties (not the `font` / `borderBottom`
// shorthands) because tabActive toggles fontWeight and borderBottomColor on top of
// this base: React warns when a longhand is added/removed across rerenders while a
// conflicting shorthand is set. Longhands throughout keep the active↔inactive swap clean.
const tabBase: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: TEXT.body,
  padding: "7px 12px", cursor: "pointer", background: "none", border: "none",
  borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: "transparent", marginBottom: -1,
};
const tabActive: CSSProperties = {
  ...tabBase, fontWeight: 600,
  color: "var(--entviz-compare-action, #3b34b0)",
  borderBottomColor: "var(--entviz-compare-action, #3b34b0)",
};
const tabInactive: CSSProperties = { ...tabBase, color: "var(--entviz-compare-neutral, #57606a)" };
const walkLaunchStyle: CSSProperties = {
  alignSelf: "flex-start", font: "inherit", fontSize: TEXT.body, padding: "5px 11px",
  borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-compare-action, #3b34b0)",
  color: "var(--entviz-compare-action, #3b34b0)", background: "none",
};

const panelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 200 };
const panelLabel: CSSProperties = { fontSize: TEXT.small, opacity: 0.7 };
// The reference figure hugs its intrinsic (font-driven) size so it tracks resize.
const figureCell: CSSProperties = { display: "inline-block" };
// A raster reference image, sized (with placeholderSize) into our figure's footprint.
const rasterRefStyle: CSSProperties = {
  objectFit: "contain", display: "block", borderRadius: 8, background: "#fff",
  border: "1px solid var(--entviz-compare-placeholder, #d0d7de)",
};
// Walk figures render at intrinsic size (no fixed width) so figureBox hugs them
// and the ring overlay maps 1:1 in the entviz's own coordinate units.
const figureFill: CSSProperties = { display: "block" };
// An empty reference slot the same footprint as OUR figure (size from
// placeholderSize), so both panels show a figure-sized box side-by-side (#3).
const placeholderBox: CSSProperties = {
  boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", cursor: "pointer",
  border: "1px dashed var(--entviz-compare-placeholder, #d0d7de)", borderRadius: 8,
  color: "var(--entviz-compare-placeholder-fg, #9aa3af)", fontSize: TEXT.small, textAlign: "center", padding: 8,
};
const textareaStyle: CSSProperties = {
  font: "1em ui-monospace, monospace", padding: "6px 8px", borderRadius: 6,
  // A bare <textarea> uses the UA's light background + dark text, which ignores a
  // dark host theme. Inherit the text color and derive a subtle surface from
  // currentColor so it adapts (a host may override --entviz-compare-input-bg/-fg).
  color: "var(--entviz-compare-input-fg, inherit)",
  background: "var(--entviz-compare-input-bg, color-mix(in srgb, currentColor 6%, transparent))",
  border: "var(--entviz-compare-input-border, 1px solid #d0d7de)", resize: "vertical",
  // basis 0 (not auto): the textarea takes the space LEFT OVER by the fixed-width
  // buttons instead of imposing its own intrinsic width — so the row never
  // overflows the comparator and the file button stays inside the panel range.
  flex: "1 1 0", minWidth: 0, boxSizing: "border-box",
};
const fetchBtn: CSSProperties = {
  font: "inherit", fontSize: TEXT.body, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--entviz-compare-action, #3b34b0)", color: "var(--entviz-compare-action, #3b34b0)", background: "none",
};
const machineCheckLabel: CSSProperties = {
  fontSize: TEXT.small, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7,
};
const chipStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
  padding: "4px 10px", borderRadius: 999, border: "1px solid", font: "inherit", fontSize: TEXT.body,
};
const warnBanner: CSSProperties = {
  background: "var(--entviz-compare-warn-bg, #fff8c5)", color: "var(--entviz-compare-warn-fg, #633c01)",
  border: "1px solid var(--entviz-compare-warn-border, #d4a72c)", borderRadius: 6, padding: "6px 10px", fontSize: TEXT.body,
};
const provenance: CSSProperties = { fontSize: TEXT.small, opacity: 0.6 };
const hint: CSSProperties = { fontSize: TEXT.small, opacity: 0.6 };
// The §2.4 scoping caveat under an affirmative verdict ("equal to THIS reference…").
const scopingNote: CSSProperties = { fontSize: TEXT.small, opacity: 0.72, maxWidth: "46ch", alignSelf: "flex-start" };

export default EntvizCompare;
