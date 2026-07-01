/**
 * <Entviz /> — a React component that renders a high-entropy value as an entviz
 * SVG, making it trivial to drop a comparable visual fingerprint into any web
 * or mobile UI. A thin wrapper over the certified @entviz/core renderer.
 */
import React from "react";
import { render, describeChannels, gridShapes, type RenderOptions } from "@entviz/core";
import { copyEntviz, type CopyKind } from "./copy-actions.ts";

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

  // Toolbar popup state — the shape picker and the copy/export kebab are both
  // dropdowns; at most one is open. Hooks run for every instance (rules of
  // hooks) but no-op until a menu opens.
  const [openMenu, setOpenMenu] = React.useState<null | "shape" | "copy">(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const shapeWrapRef = React.useRef<HTMLDivElement>(null);
  const shapeBtnRef = React.useRef<HTMLButtonElement>(null);
  const copyWrapRef = React.useRef<HTMLDivElement>(null);
  const kebabRef = React.useRef<HTMLButtonElement>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const shapeMenuId = React.useId();
  const copyMenuId = React.useId();
  const openWrapRef = openMenu === "copy" ? copyWrapRef : shapeWrapRef;
  const openTriggerRef = openMenu === "copy" ? kebabRef : shapeBtnRef;
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // Dismiss the open menu on Escape (focus returns to its trigger) and outside-click.
  React.useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenMenu(null); openTriggerRef.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      if (openWrapRef.current && !openWrapRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [openMenu, openWrapRef, openTriggerRef]);
  // Move focus to the first item when a menu opens (ARIA menu pattern).
  React.useEffect(() => {
    if (!openMenu) return;
    const id = requestAnimationFrame(() =>
      openWrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(id);
  }, [openMenu, openWrapRef]);

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

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  const doCopy = async (kind: CopyKind) => {
    setOpenMenu(null);
    try {
      await copyEntviz(kind, { value, opts: { targetAr: ar, fontSizePt: fs, note }, svg });
      flash(COPY_TOAST[kind]);
    } catch {
      flash(COPY_FAILED);
    }
  };
  // Roving focus within whichever menu received the key (its element is currentTarget).
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); doCopy("value"); }
    else if (["+", "="].includes(e.key)) { e.preventDefault(); stepFs(1); }
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
  // Reshape control: a single dropdown button showing the CURRENT shape (a
  // dropdown caret in its corner) that opens a menu of the achievable shapes.
  // One button's width instead of one-per-shape — the toolbar stays compact.
  const activeShape = shapes.find((s) => s.cols === cur.cols && s.rows === cur.rows) ?? shapes[0];
  const reshapeGroup =
    reshapable && shapes.length > 1
      ? h(
          "div",
          { ref: shapeWrapRef, style: { position: "relative", display: "inline-flex" } },
          h(
            "button",
            {
              ref: shapeBtnRef, type: "button",
              onClick: () => setOpenMenu((o) => (o === "shape" ? null : "shape")),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpenMenu("shape"); }
              },
              "aria-haspopup": "menu", "aria-expanded": openMenu === "shape",
              "aria-controls": openMenu === "shape" ? shapeMenuId : undefined, "aria-label": "shape",
              style: { ...thumbBtn, position: "relative", color: "var(--entviz-ctl-active, #3b34b0)" },
            },
            gridThumb(activeShape.cols, activeShape.rows),
            h("span", { "aria-hidden": true, style: shapeCaret }, "▾"),
          ),
          openMenu === "shape"
            ? h(
                "div",
                { id: shapeMenuId, role: "menu", "aria-label": "shape", onKeyDown: onMenuKey, style: shapeMenuStyle },
                shapes.map((s) => {
                  const active = s.cols === cur.cols && s.rows === cur.rows;
                  return h(
                    "button",
                    {
                      key: `${s.cols}x${s.rows}`, role: "menuitem", type: "button",
                      onClick: () => { setAr(s.targetAr); setOpenMenu(null); shapeBtnRef.current?.focus(); },
                      "aria-label": `${s.cols} by ${s.rows}`, "aria-pressed": active,
                      style: { ...thumbBtn, ...(active ? thumbActive : null) },
                    },
                    gridThumb(s.cols, s.rows),
                  );
                }),
              )
            : null,
        )
      : null;

  // Kebab + copy/export menu, at the trailing edge of the toolbar (after reshape).
  const kebab = h(
    "div",
    { ref: copyWrapRef, style: { position: "relative", display: "inline-flex" } },
    h(
      "button",
      {
        ref: kebabRef, type: "button",
        onClick: () => setOpenMenu((o) => (o === "copy" ? null : "copy")),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpenMenu("copy"); }
        },
        "aria-haspopup": "menu", "aria-expanded": openMenu === "copy",
        "aria-controls": openMenu === "copy" ? copyMenuId : undefined, "aria-label": "actions",
        style: { ...ctlBtn, lineHeight: 1 },
      },
      "⋮",
    ),
    openMenu === "copy"
      ? h(
          "div",
          { id: copyMenuId, role: "menu", "aria-label": "actions", onKeyDown: onMenuKey, style: copyMenuStyle },
          COPY_ACTIONS.map(([kind, label]) =>
            h("button", { key: kind, role: "menuitem", type: "button", onClick: () => doCopy(kind), style: copyMenuItemStyle }, label),
          ),
        )
      : null,
  );

  return h(
    "div",
    { className, style: { ...wrapperStyle, position: "relative", ...style }, onKeyDown, tabIndex: 0 },
    figure,
    h("div", { style: ctlStrip }, sizeGroup, reshapeGroup, kebab),
    h("span", { "aria-live": "polite", style: srOnly }, toast),
    toast ? h("span", { style: copyToastStyle }, toast) : null,
  );
}

// Copy/export menu content (English — matches the toolbar's other English chrome).
const COPY_ACTIONS: [CopyKind, string][] = [
  ["value", "Copy value"],
  ["comparison", "Copy comparison text"],
  ["image", "Copy image"],
  ["svg", "Copy SVG"],
];
const COPY_TOAST: Record<CopyKind, string> = {
  value: "Copied value", comparison: "Copied comparison text", image: "Copied image", svg: "Copied SVG",
};
const COPY_FAILED = "Copy failed";

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
// A small dropdown caret tucked into the shape button's bottom-leading corner.
const shapeCaret: React.CSSProperties = {
  position: "absolute", bottom: -2, insetInlineStart: 0, fontSize: 9, lineHeight: 1, opacity: 0.75,
};
// The shape picker's dropdown: the achievable shapes as a small wrapped palette.
const shapeMenuStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", insetInlineStart: 0, zIndex: 20,
  display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 180,
  background: "var(--entviz-menu-bg, #fff)", border: "var(--entviz-menu-border, 1px solid #ddd)",
  borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: 6,
};
const copyMenuStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", insetInlineEnd: 0, zIndex: 20,
  display: "flex", flexDirection: "column", minWidth: 180,
  background: "var(--entviz-menu-bg, #fff)", color: "var(--entviz-menu-fg, #1a1a2e)",
  border: "var(--entviz-menu-border, 1px solid #ddd)", borderRadius: 8,
  boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: 4, font: "13px system-ui, sans-serif",
};
const copyMenuItemStyle: React.CSSProperties = {
  textAlign: "start", background: "none", border: "none", borderRadius: 6,
  padding: "7px 10px", cursor: "pointer", font: "inherit", color: "inherit", whiteSpace: "nowrap",
};
const copyToastStyle: React.CSSProperties = {
  position: "absolute", top: "100%", insetInlineEnd: 0, marginTop: 6, zIndex: 25,
  background: "var(--entviz-toast-bg, #1a1a2e)", color: "var(--entviz-toast-fg, #fff)",
  borderRadius: 6, padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap", font: "11px system-ui, sans-serif",
};
const srOnly: React.CSSProperties = {
  position: "absolute", clip: "rect(0 0 0 0)", width: 1, height: 1, overflow: "hidden",
};

export default Entviz;
