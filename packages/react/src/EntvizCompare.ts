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
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { compareSvg, compareValues, describeChannels, detectMedium, rasterDisprove, render, type Raster, type RenderOptions, type Verdict, type WalkStep } from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { EntvizWalk, layoutStyle, ringOverlay, figureBox, type EntvizLayout } from "./EntvizWalk.ts";
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
  | { kind: "verdict"; verdict: Verdict }
  | { kind: "deferred"; medium: "raster" }
  | { kind: "ambiguous" };

type Provenance = "pasted" | "file" | "url" | "dropped" | "provided";

/** Pure: route an acquired reference to a machine result (no DOM, unit-tested). */
export function classifyResult(value: string, refContent: string, opts: RenderOptions = {}): CompareResult {
  if (!refContent.trim()) return { kind: "pending" };
  const medium = detectMedium(refContent);
  if (medium === "text") return { kind: "verdict", verdict: compareValues(value, refContent) };
  if (medium === "svg") return { kind: "verdict", verdict: compareSvg(refContent, value, opts) };
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

const svgDataUrl = (svg: string): string => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

/**
 * Raster path: decode the reference image, render OUR value at the same pixel
 * size, and disprove-or-bail. Never `identical` (comparison-design.md §6.3).
 */
export async function compareRaster(refSrc: string, value: string, opts: RenderOptions = {}): Promise<Verdict> {
  const refImg = await loadImage(refSrc);
  const w = refImg.naturalWidth || 1;
  const h = refImg.naturalHeight || 1;
  const reference = imageToRaster(refImg, w, h);
  const ours = imageToRaster(await loadImage(svgDataUrl(render(value, opts))), w, h);
  return rasterDisprove(reference, ours);
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

export function EntvizCompare(props: EntvizCompareProps): ReactNode {
  const { value, targetAr, fontSizePt, note, reference, layout = "side-by-side", locale, messages: overrides, onVerdict, className, style } = props;
  const m: CompareMessages = { ...defaultCompareMessages, ...overrides };
  const rtl = isRtlLocale(locale ?? "");
  const panelsStyle = layoutStyle(layout);
  const opts = useMemo(() => ({ targetAr, fontSizePt, note }), [targetAr, fontSizePt, note]);

  const [ref, setRef] = useState<{ content: string; provenance: Provenance; origin: string } | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  // null = not walking (show the two entry buttons); otherwise the chosen mode.
  const [walkMode, setWalkMode] = useState<"spot-check" | "complete" | null>(null);
  const walking = walkMode !== null;
  // The feature the guided walk is currently checking — the walk reports it (it
  // runs with externalFigures), and we ring it on OUR static figures (#reuse).
  const [walkStep, setWalkStep] = useState<WalkStep | null>(null);

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
  const chip = chipFor(result, m);

  // The reference is ALWAYS re-rendered through our own <Entviz> (the pasted SVG
  // is never embedded): for a text reference, the pasted value; for an SVG
  // reference, our value when the machine confirmed `identical` (same value).
  const refDisplayValue =
    result.kind === "verdict" && medium === "text"
      ? refContent
      : result.kind === "verdict" && medium === "svg" && result.verdict.state === "identical"
        ? value
        : null;

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
      const res = await fetch(urlInput);
      const text = await res.text();
      setRef({ content: text, provenance: "url", origin: originOf(urlInput) });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    }
  };

  // acquisition UI (only when the host did not supply a controlled reference)
  const acquisition = provided
    ? null
    : h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 6 } },
        h("textarea", {
          value: eff?.provenance === "pasted" ? refContent : "",
          onChange: (e: { target: { value: string } }) =>
            setRef({ content: e.target.value, provenance: "pasted", origin: "" }),
          "aria-label": m.pastePrompt,
          placeholder: m.pastePrompt,
          spellCheck: false,
          autoComplete: "off",
          rows: 2,
          style: textareaStyle,
        }),
        h(
          "label",
          { style: fileLabel },
          m.pickFile,
          h("input", {
            type: "file",
            accept: ".svg,image/svg+xml,image/*",
            onChange: (e: { target: { files: FileList | null } }) => onPick(e.target.files?.[0], "file"),
            style: { display: "none" },
          }),
        ),
        h(
          "div",
          { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
          h("input", {
            type: "url",
            value: urlInput,
            onChange: (e: { target: { value: string } }) => setUrlInput(e.target.value),
            placeholder: m.urlPlaceholder,
            "aria-label": m.urlPlaceholder,
            style: urlStyle,
          }),
          h(
            "button",
            { type: "button", onClick: onFetch, disabled: !originOf(urlInput), style: fetchBtn },
            m.fetchButton,
          ),
        ),
        originOf(urlInput) ? h("span", { style: hint }, fmt(m.fetchHint, { origin: originOf(urlInput) })) : null,
        fetchError ? h("span", { role: "alert", style: { ...hint, color: TONE.bad } }, fmt(m.fetchError, { error: fetchError })) : null,
        h("span", { style: hint }, m.dropHint),
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
    h("strong", { style: { fontSize: "0.95em" } }, m.heading),
    secret ? h("span", { role: "alert", style: warnBanner }, m.secretWarning) : null,
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
              // intrinsic size (NOT panelEntviz's fixed width) so figureBox hugs
              // the figure and the overlay maps 1:1 — otherwise the ring scales off
              h(Entviz, { value, targetAr: dispAr, fontSizePt: dispFs, note, style: figureFill }),
              walkStep ? ringOverlay(ourModel, walkStep, "yours") : null,
            )
          // No fixed width — the controls wrapper hugs the figure at its intrinsic
          // (font-driven) size, so resizing grows the panel and the row reflows (#2).
          : h(Entviz, {
              value, targetAr: dispAr, fontSizePt: dispFs, note,
              controls: true, reshapable: medium !== "raster",
              onResize: setDispFs, onReshape: setDispAr,
            }),
      ),
      // Reference — re-rendered at the same shared size/shape; no controls. The
      // figure (or a placeholder of the same footprint) sits DIRECTLY under the
      // label, horizontally level with "Yours" for line-of-sight comparison; the
      // acquisition inputs go BELOW so they never push the figure down (#3).
      h(
        "div",
        { style: panelStyle },
        h("span", { style: panelLabel }, m.reference),
        refDisplayValue === null
          // empty slot, sized to OUR figure's footprint (NOT in figureBox — its
          // placeholder text must stay visible)
          ? h("div", { style: { ...placeholderBox, ...placeholderSize }, "aria-hidden": true }, m.referencePlaceholder)
          : walking
            ? h(
                "div",
                { style: figureBox },
                h(Entviz, { value: refDisplayValue, targetAr: dispAr, fontSizePt: dispFs, note, style: figureFill }),
                walkStep ? ringOverlay(refModel, walkStep, "reference") : null,
              )
            : h(Entviz, { value: refDisplayValue, targetAr: dispAr, fontSizePt: dispFs, note, style: figureCell }),
        // Acquisition inputs hide during a walk (no mid-walk reference edits).
        walking ? null : acquisition,
        eff && refContent.trim()
          ? h("span", { style: provenance }, provenanceLabel(eff.provenance, eff.origin, m))
          : null,
      ),
    ),
    h(
      "span",
      { role: "status", "aria-live": "polite", style: { ...chipStyle, color: TONE[chip.tone], borderColor: TONE[chip.tone] } },
      // Label the verdict as the MACHINE's determination (distinct from the human
      // walk's "no difference found"). Omitted while still pending (an instruction,
      // not a result).
      result.kind !== "pending" ? h("span", { style: machineCheckLabel }, m.machineCheck) : null,
      h("span", { "aria-hidden": true, style: { fontWeight: 700, fontSize: "1.1em" } }, chip.symbol),
      h("span", null, chip.label),
    ),
    h("span", { style: caption }, m.recognitionNote),
    // Manual verification: available for a value reference (M2b walks value-vs-value).
    // Two entry buttons up front (terse labels; hover explains) — Spot-check and
    // Check (complete); a small value offers only Complete. Each launches the walk
    // directly in that mode (no intermediate picker).
    medium === "text" && refContent.trim()
      ? walking
        ? h(EntvizWalk, {
            value,
            reference: refContent,
            targetAr: dispAr,
            fontSizePt: dispFs,
            note,
            layout,
            mode: walkMode!, // launch straight into the chosen mode
            externalFigures: true, // reuse our static figures; just report the step
            onStep: setWalkStep,
            onComplete: () => setWalkStep(null),
            style: { marginTop: 4 },
          })
        : h(
            "div",
            { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
            small
              ? null
              : h("button", { type: "button", onClick: () => setWalkMode("spot-check"), title: m.walkSpotCheckHint, style: walkLaunchStyle }, m.walkSpotCheck),
            h("button", { type: "button", onClick: () => setWalkMode("complete"), title: m.walkCompleteHint, style: walkLaunchStyle }, m.walkComplete),
          )
      : null,
  );
}

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
// Walk figures render at intrinsic size (no fixed width) so figureBox hugs them
// and the ring overlay maps 1:1 in the entviz's own coordinate units.
const figureFill: CSSProperties = { display: "block" };
// An empty reference slot the same footprint as OUR figure (size from
// placeholderSize), so both panels show a figure-sized box side-by-side (#3).
const placeholderBox: CSSProperties = {
  boxSizing: "border-box", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px dashed var(--entviz-compare-placeholder, #d0d7de)", borderRadius: 8,
  color: "var(--entviz-compare-placeholder-fg, #9aa3af)", fontSize: "0.7em", textAlign: "center", padding: 8,
};
const textareaStyle: CSSProperties = {
  font: "0.85em ui-monospace, monospace", padding: "6px 8px", borderRadius: 6,
  border: "var(--entviz-compare-input-border, 1px solid #d0d7de)", resize: "vertical", minWidth: 200,
};
const urlStyle: CSSProperties = {
  font: "0.85em ui-monospace, monospace", padding: "4px 8px", borderRadius: 6,
  border: "var(--entviz-compare-input-border, 1px solid #d0d7de)", flex: "1 1 140px", minWidth: 120,
};
const fileLabel: CSSProperties = { fontSize: "0.8em", color: "var(--entviz-compare-action, #3b34b0)", cursor: "pointer", alignSelf: "flex-start" };
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
const caption: CSSProperties = { fontSize: "0.75em", opacity: 0.6, maxWidth: 380 };

export default EntvizCompare;
