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
  describeChannels,
  render,
  type ChannelDescription,
  type RenderOptions,
} from "@entviz/core";
import { Entviz } from "./Entviz.ts";
import { EntvizCompare } from "./EntvizCompare.ts";
import { copyEntviz, type CopyKind } from "./copy-actions.ts";
import { fmt, isRtlLocale, resolveMessages, type Messages } from "./pill-messages.ts";
import { emitEvent, type DisclosureState, type EntvizEvent, type EntvizEventInit } from "./events.ts";

export type { CopyKind };

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
  /** Controlled disclosure of the popover's open/closed state (proposal §3, §5.3).
   *  When PROVIDED, the popover follows this prop (controlled): the pill's own
   *  open/collapse actions call `onOpenChange(next)` instead of only flipping
   *  internal state. When ABSENT, the popover is uncontrolled (today's behavior),
   *  and `onOpenChange` still fires on every open/close TRANSITION.
   *  SECURITY (§5.3): controlling `open` does NOT suppress the provenance chrome or
   *  the §2.4 scoping copy — those live inside <EntvizCompare> (the pill's compare
   *  state) and are structurally always-rendered, so controlled open can't skip the
   *  reference gate. `open === true` maps to the VISUALIZE state (never straight to a
   *  verdict); entering compare stays a deliberate, reference-requiring act. */
  open?: boolean;
  /** Called on every open/close transition with the NEXT open state. Under
   *  controlled `open` this is how the pill asks the host to change state; when
   *  uncontrolled it is a notification alongside the internal state flip. */
  onOpenChange?: (open: boolean) => void;
  onExpand?: () => void;
  /** Called when the user enters the compare state from the expanded popover.
   *  Providing it opts the pill into the in-popover "Compare against a reference…"
   *  affordance; the pill then renders <EntvizCompare> in place, so recognition →
   *  verification stays a deliberate, reference-requiring act (design Seam 2). */
  onCompare?: () => void;
  /** Show the in-popover compare affordance (default true when `onCompare` is set).
   *  Lets a host keep the onCompare hook but suppress the built-in button. */
  showCompareAffordance?: boolean;
  onCopy?: (kind: CopyKind) => void;
  onError?: (message: string) => void;
  /** The typed event firehose (see events.ts). Notify-only, in addition to the
   *  specific callbacks (disclosure.change / copy / render.error). */
  onEvent?: (e: EntvizEvent) => void;
}

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
    messages: overrides, className, style, open, onOpenChange, onExpand, onCompare, showCompareAffordance, onCopy, onError, onEvent,
  } = props;

  // The event firehose: a monotonic seq per instance, and a bound `emit` that
  // stamps source="pill" and swallows a throwing host handler (events.ts).
  const seqRef = useRef(0);
  const emit = (init: EntvizEventInit) => emitEvent(onEvent, "pill", seqRef, init);

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

  // render.error (notify-only): mirror the onError path onto the firehose, firing
  // only when the error message TRANSITIONS (a fresh/changed failure).
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevErrorRef.current) emit({ type: "render.error", message: error });
    prevErrorRef.current = error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Controlled/uncontrolled disclosure of the popover (§5.3). When `open` is
  // provided, the popover follows it (controlled) and internal `expanded` is
  // ignored for the open/closed decision; when absent, `expanded` drives it
  // (uncontrolled). Either way `setOpen` fires `onOpenChange` on a transition,
  // and only flips internal state when uncontrolled — a controlled pill's own
  // click reports the requested state to the host without self-toggling.
  const controlled = open !== undefined;
  const isOpen = controlled ? !!open : expanded;
  const setOpen = (next: boolean) => {
    if (next !== isOpen) onOpenChange?.(next);
    if (!controlled) setExpanded(next);
  };

  const wrapRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const descId = useId();

  const menuFloat = useFloating(wrapRef, menuOpen, rtl);
  const popFloat = useFloating(wrapRef, isOpen, rtl);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // disclosure.change (notify-only): the Cite · Visualize · Compare lifecycle
  // state, derived from the disclosure flags — comparing wins, else expanded, else
  // the collapsed pill. Fire only on a TRANSITION, carrying the prior state.
  const disclosure: DisclosureState = comparing ? "compare" : isOpen ? "visualize" : "pill";
  const prevDisclosureRef = useRef<DisclosureState>(disclosure);
  useEffect(() => {
    const prev = prevDisclosureRef.current;
    if (disclosure !== prev) emit({ type: "disclosure.change", state: disclosure, prev });
    prevDisclosureRef.current = disclosure;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disclosure]);

  // When the popover closes (by any path, incl. a controlled `open=false` from the
  // host), reset the transient sub-states so a reopen lands back at Visualize (no
  // back-slide into a stale Compare) and no orphaned menu lingers.
  useEffect(() => {
    if (!isOpen) { setMenuOpen(false); setComparing(false); }
  }, [isOpen]);

  // Dismiss on Escape (focus returns to the pill) and outside-click. These are the
  // pill's own collapse actions, so they route through `setOpen(false)` — firing
  // `onOpenChange` and (uncontrolled only) closing the popover. A controlled host
  // gets the request and decides; the sub-state reset happens in the effect above.
  useEffect(() => {
    if (!isOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setMenuOpen(false); setComparing(false); pillRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenuOpen(false);
        setComparing(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menuOpen]);

  // Move focus to the first menu item when the menu opens (ARIA menu pattern).
  useEffect(() => {
    if (!menuOpen) return;
    const id = requestAnimationFrame(() => {
      menuFloat.ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen, menuFloat.ref]);

  const collapse = () => { setOpen(false); setComparing(false); };
  const openExpand = () => { setMenuOpen(false); setComparing(false); setOpen(true); onExpand?.(); };
  const openMenu = () => { setOpen(false); setMenuOpen(true); };
  // Recognition → verification is a deliberate act: entering compare reveals a
  // reference-requiring surface (never a verdict), and reports to the host.
  const enterCompare = () => { setComparing(true); onCompare?.(); };

  const doCopy = async (kind: CopyKind) => {
    setMenuOpen(false);
    try {
      await copyEntviz(kind, { value, opts, svg });
      if (kind === "value") flash(fmt(m.copiedValue, { n: value.length, unit: copyUnit(type) }));
      else if (kind === "comparison")
        flash(fmt(m.copiedComparison, { n: channels ? channels.cells.filter((c) => !c.blank).length : 0 }));
      else if (kind === "svg") flash(m.copiedSvg);
      else flash(m.copiedImage);
      emit({ type: "copy", kind, ok: true });
      onCopy?.(kind);
    } catch {
      emit({ type: "copy", kind, ok: false });
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

  // --- disclosure-lifecycle chrome (Cite · Visualize · Compare) --------------
  // Compare is offered only when the host opts in via onCompare (design §5 / Seam
  // 2): the pill stays recognition-only unless a verification path is wanted.
  const compareAvailable = !!onCompare && (showCompareAffordance ?? true);
  const activeStep = comparing ? "compare" : "visualize";
  const railSteps: [string, string][] = compareAvailable
    ? [["cite", m.stepCite], ["visualize", m.stepVisualize], ["compare", m.stepCompare]]
    : [["cite", m.stepCite], ["visualize", m.stepVisualize]];
  const rail = h(
    "div",
    { key: "rail", "aria-hidden": true, style: railStyle },
    railSteps.map(([k, lbl], i) =>
      h(
        "span",
        { key: k, style: { display: "inline-flex", alignItems: "center", gap: 6, opacity: k === activeStep ? 1 : 0.5, fontWeight: k === activeStep ? 600 : 500 } },
        i > 0 ? h("span", { key: "sep", style: railSepStyle }) : null,
        h("span", { key: "dot", style: railDotStyle(k === activeStep) }),
        lbl,
      ),
    ),
  );
  const teach = h("p", { key: "teach", style: teachStyle }, m.teachVisualize);
  const compareBtn = h(
    "button",
    { key: "cmpbtn", type: "button", onClick: enterCompare, style: compareBtnStyle },
    m.compareAction,
  );

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
            // to, including descender room) with a fixed-width swatch. The pill's
            // overflow:hidden clips the swatch's leading corners to the pill radius.
            // (aspect-ratio + stretch collapses an empty grid item's width, so the
            // width is set explicitly rather than derived from the height.)
            alignSelf: "stretch",
            width: "1.3em",
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
      onClick: () => (isOpen ? collapse() : openExpand()),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); doCopy("value"); }
        else if (e.key === "ArrowDown") { e.preventDefault(); openMenu(); }
      },
      title: m.view,
      "aria-label": ariaLabel,
      "aria-expanded": isOpen,
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
        borderRadius: cssVar("radius", "0.3em"),
        // Clip the badge swatch's leading corners to the pill radius.
        overflow: "hidden",
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

  // Popover body by lifecycle state. Visualize = a STANDARD <Entviz> with its
  // STANDARD toolbar (size ladder, shape picker, copy/export kebab). Compare =
  // the STANDARD <EntvizCompare> — so every comparison affordance (paste / file /
  // drop / URL acquisition, the verdict machine, the guided walk, the voice
  // ceremony) comes along unchanged; the pill only adds the rail + the deliberate,
  // reference-requiring entry into it.
  const popoverBody = error
    ? h("span", { style: { color: cssVar("error", "#b00020"), fontFamily: "ui-monospace, monospace", fontSize: 12 } }, error)
    : comparing
      ? [rail, h(EntvizCompare, { key: "cmp", value, targetAr, fontSizePt, note, locale, layout: "auto" })]
      : [rail, teach, h(Entviz, { key: "viz", value, targetAr, fontSizePt, note, controls: true }), compareAvailable ? compareBtn : null];

  const popover = isOpen
    ? h(
        "span",
        {
          ref: popFloat.ref,
          role: "dialog",
          "aria-label": ariaLabel,
          "aria-describedby": error ? undefined : descId,
          className: "entviz-pill__pop",
          style: { ...popoverStyle, ...popFloat.style },
        },
        popoverBody,
        // §9 accessible per-channel description (visually hidden; referenced by the dialog).
        channels
          ? h("span", { id: descId, style: srOnly }, a11yDescription(channels, m))
          : null,
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
        @keyframes entviz-pill-grow { from { opacity: 0; transform: scale(.72); } to { opacity: 1; transform: none; } }
        .entviz-pill__pop { animation: entviz-pill-grow .26s cubic-bezier(.2,.85,.25,1); transform-origin: var(--entviz-pill-pop-origin, 50% 0); }
        @media (prefers-reduced-motion: reduce) { .entviz-pill__pop { animation-duration: 1ms; } }
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
  // Responsive: never exceed the viewport; scroll tall content (e.g. the compare
  // surface on a phone). Width caps so the compare state isn't enormous on desktop
  // yet fits a narrow screen (where <EntvizCompare layout="auto"> then stacks).
  maxWidth: "min(720px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto",
};
// --- disclosure-lifecycle chrome styles ------------------------------------
const railStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.08em",
  textTransform: "uppercase", marginBottom: 2,
};
const railSepStyle: CSSProperties = { width: 12, height: 1, background: "currentColor", opacity: 0.25 };
function railDotStyle(active: boolean): CSSProperties {
  return { width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: active ? 1 : 0.3 };
}
const teachStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.4, opacity: 0.72, maxWidth: 340 };
const compareBtnStyle: CSSProperties = {
  alignSelf: "start", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
  color: "var(--entviz-pill-compare-fg, #3b34b0)", background: "none", border: "none", padding: "4px 0",
};
const toastStyle: CSSProperties = {
  position: "absolute", top: "100%", marginTop: 6, zIndex: 35,
  background: "var(--entviz-pill-toast-bg, #1a1a2e)", color: "var(--entviz-pill-toast-fg, #fff)",
  borderRadius: 6, padding: "5px 9px", fontSize: 11, whiteSpace: "nowrap", font: "11px system-ui, sans-serif",
};

export default EntvizPill;
