/**
 * <EntvizPill /> — the collapsed, inline "pill" form of an entviz: a constant
 * badge + the parser-derived type, with a copy menu and an expand-to-popover
 * affordance. Authored with React.createElement (no JSX) so @entviz/react ships
 * raw .ts source with no build step (mirrors Entviz.ts).
 *
 * Security/design contract (packages/react/docs/pill-design.md): the pill is
 * intentionally bare — it shows the constant badge + the trusted type label
 * only, never the note, value characters, or any value-derived visual (so it
 * trains no glance-equivalence or vanity-grind heuristic). It affords
 * locate / expand / copy — never an equality decision (recognition ≠
 * verification). Chrome is localized + RTL-mirrored; the entviz itself never is.
 */
import {
  createElement as h,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  classifyInput,
  comparisonText,
  describeChannels,
  render,
  type ChannelDescription,
  type RenderOptions,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { fmt, isRtlLocale, resolveMessages, type Messages } from "./pill-messages.ts";

export interface EntvizPillProps {
  // --- entviz render inputs (deterministic, context-free) ---
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  // --- pill chrome (contextual) ---
  /** First-party custom text shown after the type (host-set, trusted — unlike the note). */
  label?: string;
  /** Show the parser-derived type label (default true). Independent of `label`. */
  showType?: boolean;
  showIcon?: boolean;
  maxWidth?: number | string;
  locale?: string;
  /** Chrome writing direction. "auto" (default) follows the locale's script. */
  dir?: "ltr" | "rtl" | "auto";
  messages?: Partial<Messages>;
  className?: string;
  style?: CSSProperties;
  onExpand?: () => void;
  onCopy?: (kind: CopyKind) => void;
  onError?: (message: string) => void;
}

export type CopyKind = "value" | "comparison" | "image" | "svg";

// 2×2 row-major: gold + blue on top, black + red on bottom — keeps the two dark
// cells off the bottom row so the badge doesn't read as bottom-heavy. Constant
// on every entviz (zero identity bits — design §3.1).
const BADGE = ["#e7be00", "#2f3fbf", "#000000", "#ff3f2f"];

/** Compact display form of the parser type label (hex(N)→hex·bits, txt→text). */
export function prettyType(typeName: string): string {
  const hex = typeName.match(/^hex\((\d+)\)$/);
  if (hex) return `hex·${Number(hex[1]) * 4}`;
  if (/^txt\(/.test(typeName)) return "text";
  if (typeName === "ETH") return "Ethereum";
  return typeName; // UUID, etc.
}

/** The unit word in the "Copied value · N <unit>" confirmation. */
export function copyUnit(type: string | null): string {
  return /^hex·/.test(type ?? "") ? "hex chars" : "chars";
}

// Anchored-floater placement: flip above when there's no room below, then clamp
// horizontally into the viewport (RTL right-aligns). Pure math, unit-tested.
export function placeFloater(
  a: { top: number; bottom: number; left: number; right: number },
  f: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
): { top: number; left: number } {
  const gap = 6, pad = 8;
  const below = viewport.height - a.bottom >= f.height + gap || viewport.height - a.bottom >= a.top;
  const top = below ? a.bottom + gap : Math.max(pad, a.top - f.height - gap);
  let left = rtl ? a.right - f.width : a.left;
  left = Math.max(pad, Math.min(left, viewport.width - f.width - pad));
  return { top, left };
}

// The accessible, color-independent description of the expanded entviz (design
// §9): every discrete verification channel as text, so AT users reach parity.
// Pure: takes the already-computed channel data + the localized template.
export function a11yDescription(channels: ChannelDescription, m: Messages): string {
  const rc = (ci: number) => `${Math.floor(ci / channels.cols)},${ci % channels.cols}`;
  const cells = channels.cells.map((c) => (c.blank ? "·" : (c.text as string))).join(" ");
  const bars = channels.colorBarLetters.join(" ");
  const quartiles = channels.quartiles.map((q) => (q.cellIndex === null ? "—" : rc(q.cellIndex))).join(" ");
  const bmin = channels.markers.blankMap ? rc(channels.markers.blankMap.minCell) : "—";
  const bmax = channels.markers.blankMap ? rc(channels.markers.blankMap.maxCell) : "—";
  return fmt(m.desc, {
    type: channels.typeName,
    cells,
    bars,
    quartiles,
    bmin,
    bmax,
    bleft: channels.markers.colorBar.left,
    bright: channels.markers.colorBar.right,
    bslots: channels.markers.colorBar.slots,
  });
}

async function rasterizeToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("image decode failed"));
      img.src = url;
    });
    const w = img.naturalWidth || 200;
    const hgt = img.naturalHeight || 200;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = hgt * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// position:fixed so it's measured against the viewport and never clipped under
// the fold; recomputed on resize/scroll. The placement math is placeFloater().
function useFloating(anchorRef: RefObject<HTMLElement | null>, open: boolean, rtl: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    visibility: "hidden",
  });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const f = ref.current?.getBoundingClientRect();
      if (!a || !f) return;
      const { top, left } = placeFloater(
        a,
        { width: f.width, height: f.height },
        { width: window.innerWidth, height: window.innerHeight },
        rtl,
      );
      setStyle({ position: "fixed", top, left, visibility: "visible" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, rtl, anchorRef]);
  return { ref, style };
}

export function EntvizPill(props: EntvizPillProps): ReactNode {
  const {
    value, targetAr, fontSizePt, note,
    label, showType = true, showIcon = true, maxWidth, locale, dir,
    messages: overrides, className, style, onExpand, onCopy, onError,
  } = props;

  const { locale: resolved, messages: base } = useMemo(() => resolveMessages(locale), [locale]);
  const m: Messages = { ...base, ...overrides };
  // dir prop wins; "auto"/unset follows the locale script. Chrome mirrors only.
  const rtl = dir === "rtl" ? true : dir === "ltr" ? false : isRtlLocale(resolved);
  const dirAttr: "rtl" | "ltr" | undefined = rtl ? "rtl" : dir === "ltr" ? "ltr" : undefined;

  const opts: RenderOptions = { targetAr, fontSizePt, note };
  const { type, truncated, channels, svg, error } = useMemo(() => {
    try {
      const ci = classifyInput(value.trim());
      const ch = describeChannels(value, opts);
      return {
        type: prettyType(ci.typeName),
        truncated: ch.truncated,
        channels: ch as ChannelDescription | null,
        svg: render(value, opts),
        error: null as string | null,
      };
    } catch (e) {
      return {
        type: null as string | null,
        truncated: false,
        channels: null as ChannelDescription | null,
        svg: null as string | null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, targetAr, fontSizePt, note]);

  useEffect(() => { if (error && onError) onError(error); }, [error, onError]);

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const wrapRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const descId = useId();

  const menuFloat = useFloating(wrapRef, menuOpen, rtl);
  const popFloat = useFloating(wrapRef, expanded, rtl);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Dismiss on Escape (focus returns to the pill) and outside-click.
  useEffect(() => {
    if (!expanded && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setExpanded(false); setMenuOpen(false); pillRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [expanded, menuOpen]);

  // Move focus to the first menu item when the menu opens (ARIA menu pattern).
  useEffect(() => {
    if (!menuOpen) return;
    const id = requestAnimationFrame(() => {
      menuFloat.ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen, menuFloat.ref]);

  const openExpand = () => { setMenuOpen(false); setExpanded(true); onExpand?.(); };
  const openMenu = () => { setExpanded(false); setMenuOpen(true); };

  const doCopy = async (kind: CopyKind) => {
    setMenuOpen(false);
    try {
      if (kind === "value") {
        await navigator.clipboard.writeText(value);
        flash(fmt(m.copiedValue, { n: value.length, unit: copyUnit(type) }));
      } else if (kind === "comparison") {
        if (!channels) throw new Error("no render");
        const text = comparisonText(value, opts);
        const n = channels.cells.filter((c) => !c.blank).length;
        await navigator.clipboard.writeText(text);
        flash(fmt(m.copiedComparison, { n }));
      } else if (kind === "svg") {
        if (!svg) throw new Error("no render");
        await navigator.clipboard.writeText(svg);
        flash(m.copiedSvg);
      } else {
        if (!svg) throw new Error("no render");
        const blob = await rasterizeToPng(svg);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        flash(m.copiedImage);
      }
      onCopy?.(kind);
    } catch {
      flash(m.copyFailed);
    }
  };

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const items = [...(menuFloat.ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  };

  // Type is the trusted, derived channel; on a >512-bit input it is prefixed with
  // the "fingerprint of" marker (the text channel is no longer lossless — §3.1).
  // `label` is first-party host text. Never the note (self-declared) on the pill.
  const typeText = truncated && type ? `${m.truncated} ${type}` : type;
  const shownParts = [showType ? typeText : null, label].filter(Boolean) as string[];
  const ariaText = shownParts.length ? shownParts.join(", ") : (typeText ?? "unrenderable");
  const ariaLabel = fmt(m.ariaView, { type: ariaText });

  const ACTIONS: [CopyKind | "view", string, () => void][] = [
    ["view", m.view, openExpand],
    ["value", m.copyValue, () => doCopy("value")],
    ["comparison", m.copyComparison, () => doCopy("comparison")],
    ["image", m.copyImage, () => doCopy("image")],
    ["svg", m.copySvg, () => doCopy("svg")],
  ];

  const cssVar = (name: string, fallback: string) => `var(--entviz-pill-${name}, ${fallback})`;

  // --- badge ---
  // The badge is the pill's leading cap: a square color swatch bled over the
  // pill's 1px border on the top, bottom, and leading edge (via negative margins)
  // so its color runs flush to the pill's outer edge with a crisp square corner.
  // The pill's own leading corners are squared to match (pillBody, below).
  const badge = showIcon
    ? h(
        "span",
        {
          "aria-hidden": true,
          style: {
            display: "inline-grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            // Fill the pill's inner height (whatever the text's line box works out
            // to, including descender room) with a fixed-width swatch; bleed -1px
            // over the top/bottom/leading border so it's flush to the outer edge.
            // (aspect-ratio + stretch collapses an empty grid item's width, so the
            // width is set explicitly rather than derived from the height.)
            alignSelf: "stretch",
            width: "1.3em",
            marginBlock: "-1px",
            marginInlineStart: "-1px",
            overflow: "hidden",
            flex: "0 0 auto",
          },
        },
        BADGE.map((c) => h("span", { key: c, style: { background: c } })),
      )
    : null;

  // --- pill text (truncation marker + type + label) ---
  const textBlock = shownParts.length
    ? h(
        "span",
        // paddingBlock keeps descenders (g, y, p) inside the overflow:hidden clip
      // box — a tight lineHeight:1 box would otherwise shear them off.
      { style: { display: "inline-flex", gap: "0.4em", overflow: "hidden", whiteSpace: "nowrap", paddingBlock: "0.16em" } },
        showType && type
          ? h(
              "span",
              { key: "type", style: { opacity: 0.62 } },
              truncated
                ? h(
                    "span",
                    { style: { color: cssVar("truncated", "#a00000"), fontWeight: "bold", marginInlineEnd: "0.3em" } },
                    m.truncated,
                  )
                : null,
              type,
            )
          : null,
        label ? h("span", { key: "label" }, label) : null,
      )
    : null;

  const pillButton = h(
    "button",
    {
      ref: pillRef,
      type: "button",
      onClick: () => (expanded ? setExpanded(false) : openExpand()),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); doCopy("value"); }
        else if (e.key === "ArrowDown") { e.preventDefault(); openMenu(); }
      },
      title: m.view,
      "aria-label": ariaLabel,
      "aria-expanded": expanded,
      style: {
        display: "inline-flex", alignItems: "center", gap: cssVar("gap", "0.35em"),
        font: "inherit", color: "inherit", background: "none", border: "none",
        padding: 0, margin: 0, cursor: "pointer", maxWidth: "100%",
      },
    },
    badge,
    textBlock,
  );

  const kebab = h(
    "button",
    {
      type: "button",
      className: "entviz-pill__kebab",
      onClick: () => (menuOpen ? setMenuOpen(false) : openMenu()),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openMenu(); }
      },
      "aria-haspopup": "menu",
      "aria-expanded": menuOpen,
      "aria-controls": menuOpen ? menuId : undefined,
      "aria-label": m.actions,
      style: {
        font: "inherit", color: "inherit", background: "none", border: "none",
        padding: "0 0.15em", margin: 0, cursor: "pointer", lineHeight: 1,
        opacity: menuOpen ? 0.85 : undefined,
      },
    },
    "⋮",
  );

  const pillBody = h(
    "span",
    {
      style: {
        display: "inline-flex", alignItems: "center", gap: cssVar("gap", "0.35em"),
        font: "inherit", color: "currentColor",
        // Zero vertical padding + a tight line box so the pill hugs its content and
        // doesn't inflate the line it sits in. With a badge, the inline-start
        // padding is dropped so the badge fills the pill's leading cap (clipped to
        // the corner via its own leading radius, above).
        paddingBlock: 0,
        paddingInlineStart: showIcon ? 0 : "0.4em",
        paddingInlineEnd: "0.4em",
        borderRadius: cssVar("radius", "0.2em"),
        // With a badge capping the leading edge, square the pill's leading corners
        // so the badge swatch's square corner meets the pill's outer edge cleanly.
        ...(showIcon ? { borderStartStartRadius: 0, borderEndStartRadius: 0 } : null),
        border: cssVar("border", "1px solid color-mix(in srgb, currentColor 25%, transparent)"),
        background: cssVar("bg", "color-mix(in srgb, currentColor 6%, transparent)"),
        whiteSpace: "nowrap", maxWidth, lineHeight: 1,
      },
    },
    pillButton,
    kebab,
  );

  const menu = menuOpen
    ? h(
        "span",
        { ref: menuFloat.ref, id: menuId, role: "menu", "aria-label": m.actions, onKeyDown: onMenuKey, style: { ...menuStyle, ...menuFloat.style } },
        ACTIONS.map(([kind, lbl, fn]) =>
          h("button", { key: kind, role: "menuitem", type: "button", onClick: fn, style: menuItemStyle }, lbl),
        ),
      )
    : null;

  const popover = expanded
    ? h(
        "span",
        {
          ref: popFloat.ref,
          role: "dialog",
          "aria-label": ariaLabel,
          "aria-describedby": error ? undefined : descId,
          style: { ...popoverStyle, ...popFloat.style },
        },
        error
          ? h("span", { style: { color: cssVar("error", "#b00020"), fontFamily: "ui-monospace, monospace", fontSize: 12 } }, error)
          : h(Entviz, { value, targetAr, fontSizePt, note, style: { width: 240, display: "block" } }),
        // §9 accessible per-channel description (visually hidden; referenced by the dialog).
        channels
          ? h("span", { id: descId, style: srOnly }, a11yDescription(channels, m))
          : null,
        h(
          "span",
          { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          ACTIONS.slice(1).map(([kind, lbl, fn]) =>
            h("button", { key: kind, type: "button", onClick: fn, style: copyBtnStyle, disabled: !svg }, lbl),
          ),
        ),
      )
    : null;

  return h(
    "span",
    {
      ref: wrapRef,
      dir: dirAttr,
      className,
      // "middle" vertically centers the pill on the line (baseline sat it low).
      style: { position: "relative", display: "inline-flex", verticalAlign: "middle", ...style },
      onMouseEnter: (e: ReactMouseEvent<HTMLSpanElement>) => e.currentTarget.classList.add("entviz-pill--hover"),
      onMouseLeave: (e: ReactMouseEvent<HTMLSpanElement>) => e.currentTarget.classList.remove("entviz-pill--hover"),
    },
    pillBody,
    menu,
    popover,
    h("span", { "aria-live": "polite", style: srOnly }, toast),
    toast ? h("span", { style: { ...toastStyle, [rtl ? "left" : "right"]: 0 } }, toast) : null,
    h("style", null, `
        .entviz-pill__kebab { opacity: 0; transition: opacity .12s; }
        .entviz-pill--hover .entviz-pill__kebab,
        .entviz-pill__kebab:focus-visible { opacity: 0.7; }
      `),
  );
}

const srOnly: CSSProperties = {
  position: "absolute",
  clip: "rect(0 0 0 0)",
  width: 1,
  height: 1,
  overflow: "hidden",
};
const menuStyle: CSSProperties = {
  zIndex: 30, display: "flex", flexDirection: "column", minWidth: 210,
  background: "var(--entviz-pill-menu-bg, #fff)", color: "var(--entviz-pill-menu-fg, #1a1a2e)",
  border: "var(--entviz-pill-menu-border, 1px solid #ddd)", borderRadius: 8,
  boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: 4, font: "13px system-ui, sans-serif",
};
const menuItemStyle: CSSProperties = {
  textAlign: "start", background: "none", border: "none", borderRadius: 6,
  padding: "7px 10px", cursor: "pointer", font: "inherit", color: "inherit",
};
const popoverStyle: CSSProperties = {
  zIndex: 30, display: "flex", flexDirection: "column", gap: 10, alignItems: "start",
  background: "var(--entviz-pill-popover-bg, #fff)", border: "var(--entviz-pill-popover-border, 1px solid #e6e6f0)",
  borderRadius: 12, padding: 14, boxShadow: "0 8px 30px rgba(0,0,0,.16)", font: "13px system-ui, sans-serif",
};
const copyBtnStyle: CSSProperties = {
  background: "var(--entviz-pill-action-bg, #eef0ff)", color: "var(--entviz-pill-action-fg, #3b34b0)",
  border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer",
};
const toastStyle: CSSProperties = {
  position: "absolute", top: "100%", marginTop: 6, zIndex: 35,
  background: "var(--entviz-pill-toast-bg, #1a1a2e)", color: "var(--entviz-pill-toast-fg, #fff)",
  borderRadius: 6, padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap", font: "11px system-ui, sans-serif",
};

export default EntvizPill;
