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
  onVerdict?: (v: Verdict) => void;
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

export function EntvizCompare(props: EntvizCompareProps): ReactNode {
  const { value, targetAr, fontSizePt, note, reference, layout = "side-by-side", locale, messages: overrides, onVerdict, className, style } = props;
  const m: CompareMessages = { ...defaultCompareMessages, ...overrides };
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
  const isUrl = medium === "ambiguous" && !!refOrigin;
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
      () => { if (alive) setRasterV({ state: "unknown", reason: "could not read the reference image" }); },
    );
    return () => { alive = false; };
  }, [medium, refContent, value, opts]);

  const result: CompareResult =
    baseResult.kind === "deferred" && rasterV ? { kind: "verdict", verdict: rasterV } : baseResult;
  useEffect(() => {
    if (result.kind === "verdict") onVerdict?.(result.verdict);
  }, [result, onVerdict]);

  const secret = looksLikeSecret(value) || looksLikeSecret(refContent);
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
      () => setFetchError("read failed"),
    );
  };

  const onFetch = async () => {
    setFetchError(null);
    try {
      const res = await fetch(refContent);
      const text = await res.text();
      setRef({ content: text, provenance: "url", origin: refOrigin });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    }
  };

  // The reference file input, rendered once (hidden). The empty reference rect is
  // a <label htmlFor> that opens it (click-the-rect-to-upload); it also stays a
  // drop target. Not offered for a controlled/provided reference.
  const fileInput = provided
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
            // A raster reference (pasted/dropped/picked image) shows an "[image]"
            // marker rather than its data URL; a pasted text value shows itself.
            value: medium === "raster" ? m.imagePasted : eff?.provenance === "pasted" ? refContent : "",
            // Editing over the marker drops it, so typing replaces the image with text.
            onChange: (e: { target: { value: string } }) =>
              setRef({ content: e.target.value.replace(m.imagePasted, ""), provenance: "pasted", origin: "" }),
            // A pasted raster image (screenshot) becomes the reference — read it as
            // a file (data URL → raster engine) instead of the default text paste.
            onPaste: (e: {
              preventDefault: () => void;
              clipboardData: { files: FileList | File[] };
            }) => {
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
              onResize: setDispFs, onReshape: setDispAr,
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
          ? h(
              "label",
              { htmlFor: fileInputId, style: { ...placeholderBox, ...placeholderSize } },
              h(
                "svg",
                {
                  "aria-hidden": true, width: "1.7em", height: "1.7em", viewBox: "0 0 24 24",
                  fill: "none", stroke: "currentColor", strokeWidth: 2,
                  strokeLinecap: "round", strokeLinejoin: "round", style: { display: "block", opacity: 0.75, marginBottom: 4 },
                },
                h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
                h("polyline", { points: "17 8 12 3 7 8" }),
                h("line", { x1: 12, y1: 3, x2: 12, y2: 15 }),
              ),
              m.dropHint,
            )
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
          h("span", { "aria-hidden": true, style: { fontWeight: 700, fontSize: "1.1em" } }, chip.symbol),
          h("span", null, chip.label),
        )
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
            onStep: setWalkStep,
            onComplete: () => setWalkStep(null),
            style: { marginTop: 4 },
          })
        : h(
            "div",
            { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            small || medium === "raster"
              ? null
              : h("button", { type: "button", onClick: () => setWalkMode("spot-check"), title: m.walkSpotCheckHint, style: walkLaunchStyle }, m.walkSpotCheck),
            h("button", { type: "button", onClick: () => setWalkMode("complete"), title: m.walkCompleteHint, style: walkLaunchStyle }, m.walkComplete),
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
  });

  const tabButton = (key: "reference" | "voice", label: string, icon: ReactNode): ReactNode =>
    h(
      "button",
      {
        type: "button", role: "tab", "aria-selected": tab === key,
        onClick: () => setTab(key), style: tab === key ? tabActive : tabInactive,
      },
      icon,
      h("span", null, label),
    );

  return h(
    "div",
    {
      dir: rtl ? "rtl" : undefined,
      className,
      onDragOver: provided ? undefined : (e: { preventDefault: () => void }) => e.preventDefault(),
      onDrop: provided
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
      ? h("strong", { style: { fontSize: "0.95em" } }, m.heading)
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
const tabBase: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, font: "inherit", fontSize: "0.9em",
  padding: "7px 12px", cursor: "pointer", background: "none", border: "none",
  borderBottom: "2px solid transparent", marginBottom: -1,
};
const tabActive: CSSProperties = {
  ...tabBase, fontWeight: 600,
  color: "var(--entviz-compare-action, #3b34b0)",
  borderBottomColor: "var(--entviz-compare-action, #3b34b0)",
};
const tabInactive: CSSProperties = { ...tabBase, color: "var(--entviz-compare-neutral, #57606a)" };
const walkLaunchStyle: CSSProperties = {
  alignSelf: "flex-start", font: "inherit", fontSize: "0.85em", padding: "5px 11px",
  borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--entviz-compare-action, #3b34b0)",
  color: "var(--entviz-compare-action, #3b34b0)", background: "none",
};

const panelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minWidth: 200 };
const panelLabel: CSSProperties = { fontSize: "0.8em", opacity: 0.7 };
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
  color: "var(--entviz-compare-placeholder-fg, #9aa3af)", fontSize: "0.7em", textAlign: "center", padding: 8,
};
const textareaStyle: CSSProperties = {
  font: "0.85em ui-monospace, monospace", padding: "6px 8px", borderRadius: 6,
  border: "var(--entviz-compare-input-border, 1px solid #d0d7de)", resize: "vertical",
  // basis 0 (not auto): the textarea takes the space LEFT OVER by the fixed-width
  // buttons instead of imposing its own intrinsic width — so the row never
  // overflows the comparator and the file button stays inside the panel range.
  flex: "1 1 0", minWidth: 0, boxSizing: "border-box",
};
const fetchBtn: CSSProperties = {
  font: "inherit", fontSize: "0.8em", padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--entviz-compare-action, #3b34b0)", color: "var(--entviz-compare-action, #3b34b0)", background: "none",
};
const machineCheckLabel: CSSProperties = {
  fontSize: "0.7em", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7,
};
const chipStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
  padding: "4px 10px", borderRadius: 999, border: "1px solid", font: "inherit", fontSize: "0.9em",
};
const warnBanner: CSSProperties = {
  background: "var(--entviz-compare-warn-bg, #fff8c5)", color: "var(--entviz-compare-warn-fg, #633c01)",
  border: "1px solid var(--entviz-compare-warn-border, #d4a72c)", borderRadius: 6, padding: "6px 10px", fontSize: "0.85em",
};
const provenance: CSSProperties = { fontSize: "0.75em", opacity: 0.6 };
const hint: CSSProperties = { fontSize: "0.72em", opacity: 0.6 };

export default EntvizCompare;
