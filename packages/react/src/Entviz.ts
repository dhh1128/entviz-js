/**
 * <Entviz /> — a React component that renders a high-entropy value as an entviz
 * SVG, making it trivial to drop a comparable visual fingerprint into any web
 * or mobile UI. A thin wrapper over the certified @entviz/core renderer.
 */
import React from "react";
import { render, describeChannels, gridShapes, type RenderOptions } from "@entviz/core";

export interface EntvizProps {
  /** The high-entropy value to visualize (key, hash, UUID, address, …). */
  value: string;
  /** Target aspect ratio W/H (default 1.0). */
  targetAr?: number;
  /** Reference font size in points (default 12). */
  fontSizePt?: number;
  /** Optional out-of-band caption (≤10 printable-ASCII chars, U+0020–U+007E). */
  note?: string | null;
  /** Extra props applied to the wrapping element (className, style, …). */
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label; defaults to a description that includes the note. */
  title?: string;
  /** Called with the error message if rendering throws (e.g. bad note). */
  onError?: (message: string) => void;
  /** Show opt-in, suppressible size (font-size ladder) + reshape controls beside
   *  the figure. Off by default — the bare component stays a pure render. */
  controls?: boolean;
  /** Whether the reshape (grid-shape) control is offered when `controls` is on
   *  (default true). The comparator turns this off for a raster reference, which
   *  can't be re-rendered into a different shape. */
  reshapable?: boolean;
  /** Resize handler. When given, font size is CONTROLLED (the parent owns it —
   *  e.g. the comparator drives both figures); otherwise it is managed internally. */
  onResize?: (fontSizePt: number) => void;
  /** Reshape handler. When given, the aspect ratio is CONTROLLED; otherwise
   *  managed internally. Receives the `targetAr` of the chosen grid shape. */
  onReshape?: (targetAr: number) => void;
}

/**
 * Renders the entviz inline. Injecting the SVG as raw HTML is safe ONLY because
 * the markup is produced entirely by @entviz/core: it emits a fixed set of SVG
 * shapes with numeric attributes, XML-escapes every text node (the type label
 * and the user note), and never interpolates caller-supplied markup, URLs, or
 * event-handler attributes. The `value`/`note` props are escaped by the
 * renderer, not trusted here. If this component is ever changed to embed
 * caller-provided markup, this injection MUST be reconsidered (sanitize, or drop
 * it) — that would reintroduce an XSS vector this wrapper currently does not
 * have. The root <svg> carries a viewBox, so the entviz scales responsively.
 */
export function Entviz(props: EntvizProps): React.ReactElement {
  const { value, targetAr, fontSizePt, note, className, style, title, onError,
    controls = false, reshapable = true, onResize, onReshape } = props;

  // Opt-in resize/reshape state: CONTROLLED when the parent passes a handler (it
  // owns the value — e.g. the comparator drives both figures), else managed
  // internally. With controls off, fs/ar are exactly the props — the bare
  // component is unchanged and pure.
  const [stateFs, setStateFs] = React.useState(() => fontSizePt ?? DEFAULT_FONT_SIZE_PT);
  const [stateAr, setStateAr] = React.useState(() => targetAr ?? 1);
  const fsControlled = onResize !== undefined;
  const arControlled = onReshape !== undefined;
  const fs = controls ? (fsControlled ? (fontSizePt ?? DEFAULT_FONT_SIZE_PT) : stateFs) : fontSizePt;
  const ar = controls ? (arControlled ? (targetAr ?? 1) : stateAr) : targetAr;

  const svg = React.useMemo(() => {
    const opts: RenderOptions = { targetAr: ar, fontSizePt: fs, note };
    try {
      return render(value, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (onError) onError(msg);
      return null;
    }
  }, [value, ar, fs, note, onError]);

  // PSY-JS-F3: fold the note into the default accessible label so a screen
  // reader conveys the caption a sighted user sees in the bottom strip. An
  // explicit `title` still wins.
  // An entviz is a *visualization*, never a "fingerprint" (pill design §1;
  // paper terminology) — the label reflects that.
  const defaultLabel = note ? `entviz visualization, note ${note}` : "entviz visualization";

  if (svg === null) {
    return React.createElement("span", {
      className,
      style,
      role: "img",
      "aria-label": title ?? "entviz (render error)",
    });
  }
  const figure = React.createElement("span", {
    ...(controls ? {} : { className, style }),
    role: "img",
    "aria-label": title ?? defaultLabel,
    dangerouslySetInnerHTML: { __html: svg },
  });

  if (!controls) return figure;

  // --- opt-in controls (size ladder + reshape picker), beside the figure ------
  const h = React.createElement;
  const curPt = fs ?? DEFAULT_FONT_SIZE_PT;
  const setFs = (v: number) => (fsControlled ? onResize!(v) : setStateFs(v));
  const setAr = (v: number) => (arControlled ? onReshape!(v) : setStateAr(v));
  const ladderIdx = nearestLadderIndex(curPt);
  const stepFs = (dir: number) =>
    setFs(FONT_SIZE_LADDER[Math.max(0, Math.min(FONT_SIZE_LADDER.length - 1, ladderIdx + dir))]);
  const reset = () => { setFs(fontSizePt ?? DEFAULT_FONT_SIZE_PT); setAr(targetAr ?? 1); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (["+", "="].includes(e.key)) { e.preventDefault(); stepFs(1); }
    else if (["-", "_"].includes(e.key)) { e.preventDefault(); stepFs(-1); }
    else if (e.key === "0") { e.preventDefault(); reset(); }
  };

  const shapes = gridShapes(value);
  const cur = describeChannels(value, { targetAr: ar, fontSizePt: fs, note });
  const sizeGroup = h(
    "div",
    { role: "group", "aria-label": "size", style: ctlGroup },
    h("button", { type: "button", onClick: () => stepFs(-1), disabled: ladderIdx === 0, "aria-label": "smaller", style: ctlBtn }, "−"),
    h("span", { style: ctlValue }, `${curPt}pt`),
    h("button", { type: "button", onClick: () => stepFs(1), disabled: ladderIdx === FONT_SIZE_LADDER.length - 1, "aria-label": "larger", style: ctlBtn }, "+"),
  );
  const reshapeGroup =
    reshapable && shapes.length > 1
      ? h(
          "div",
          { role: "group", "aria-label": "shape", style: ctlGroup },
          shapes.map((s) => {
            const active = s.cols === cur.cols && s.rows === cur.rows;
            return h(
              "button",
              {
                key: `${s.cols}x${s.rows}`, type: "button",
                onClick: () => setAr(s.targetAr),
                "aria-label": `${s.cols} by ${s.rows}`, "aria-pressed": active,
                style: { ...thumbBtn, ...(active ? thumbActive : null) },
              },
              gridThumb(s.cols, s.rows),
            );
          }),
        )
      : null;

  return h(
    "div",
    { className, style: { ...wrapperStyle, ...style }, onKeyDown, tabIndex: 0 },
    figure,
    h("div", { style: ctlStrip }, sizeGroup, reshapeGroup),
  );
}

/** The clean font-size ladder the size control steps through (points). Bounded
 *  to the spec's valid font-size range [6, 30]. */
export const DEFAULT_FONT_SIZE_PT = 12;
export const FONT_SIZE_LADDER = [6, 8, 10, 12, 14, 16, 20, 24, 30];

function nearestLadderIndex(pt: number): number {
  let best = 0, bestD = Infinity;
  FONT_SIZE_LADDER.forEach((v, i) => {
    const d = Math.abs(v - pt);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// A tiny cols×rows grid icon for a reshape option (Google-Docs-table style). The
// constituent cells are drawn 3:2 (the entviz cell's true aspect) with gaps and
// padding proportional to the cell, so the thumbnail's overall shape matches the
// entviz's real shape — a 2×3 reads square, a 3×2 reads wide, as they actually
// render (a square cell made a near-square 2×3 look portrait).
function gridThumb(cols: number, rows: number): React.ReactElement {
  const cw = 3, ch = 2, gapX = 0.6, gapY = 0.4, pad = 1; // cell w:h = 3:2
  const w = pad * 2 + cols * cw + (cols - 1) * gapX;
  const hgt = pad * 2 + rows * ch + (rows - 1) * gapY;
  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(React.createElement("rect", {
        key: `${r}-${c}`, x: pad + c * (cw + gapX), y: pad + r * (ch + gapY),
        width: cw, height: ch, fill: "currentColor",
      }));
    }
  }
  return React.createElement("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, "aria-hidden": true, style: { display: "block" } }, cells);
}

const wrapperStyle: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-start" };
// Single-row toolbar below the figure: size group + reshape group, never wrapped.
const ctlStrip: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "nowrap" };
const ctlGroup: React.CSSProperties = { display: "inline-flex", gap: 4, alignItems: "center" };
const ctlBtn: React.CSSProperties = {
  font: "inherit", fontSize: "0.85em", lineHeight: 1, minWidth: 22, padding: "2px 6px", borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--entviz-ctl, #d0d7de)", background: "var(--entviz-ctl-bg, #fff)",
};
const ctlValue: React.CSSProperties = { font: "inherit", fontSize: "0.8em", opacity: 0.8, minWidth: 34, textAlign: "center" };
const thumbBtn: React.CSSProperties = {
  display: "inline-flex", padding: 3, borderRadius: 6, cursor: "pointer",
  border: "1px solid var(--entviz-ctl, #d0d7de)", background: "var(--entviz-ctl-bg, #fff)", color: "#8a93a2",
};
const thumbActive: React.CSSProperties = { borderColor: "var(--entviz-ctl-active, #3b34b0)", color: "var(--entviz-ctl-active, #3b34b0)" };

export default Entviz;
