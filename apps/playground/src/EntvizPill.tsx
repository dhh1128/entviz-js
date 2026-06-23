import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Entviz } from "@entviz/react";
import { classifyInput, render, type RenderOptions } from "@entviz/core";
import {
  fmt,
  isRtlLocale,
  resolveMessages,
  type Messages,
} from "./pill-messages.ts";

// PROTOTYPE — lives in the playground for experimentation, NOT yet in
// @entviz/react. Faithful to packages/react/docs/pill-design.md. Promotion to
// the gated package (createElement + tests) is the follow-up.

export interface EntvizPillProps {
  // --- entviz render inputs (deterministic, context-free) ---
  value: string;
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
  // --- pill chrome (contextual) ---
  showIcon?: boolean;
  maxWidth?: number | string;
  locale?: string;
  messages?: Partial<Messages>;
  className?: string;
  style?: React.CSSProperties;
  onExpand?: () => void;
  onCopy?: (kind: CopyKind) => void;
  onError?: (message: string) => void;
}

export type CopyKind = "value" | "comparison" | "image" | "svg";

const BADGE = ["#e7be00", "#ff3f2f", "#2f3fbf", "#000000"];

// Prettify the parser's trusted type label for the pill: "hex(64)" -> "hex·256"
// (chars*4 bits), "txt(43)->b64url" -> "text", etc. The type is the trusted
// channel (spec label-strip); never the note, never value characters.
function prettyType(typeName: string): string {
  const hex = typeName.match(/^hex\((\d+)\)$/);
  if (hex) return `hex·${Number(hex[1]) * 4}`;
  if (/^txt\(/.test(typeName)) return "text";
  if (typeName === "ETH") return "Ethereum";
  return typeName; // UUID, etc.
}

// Comparison text = the filled cells' nucleus text in grid reading order
// (data-cell-index is row-major), case-exact, space-separated. Parsed from the
// authoritative rendered SVG. (Core should eventually expose this directly.)
function comparisonTextFromSvg(svg: string): { text: string; cells: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const cells = [...doc.querySelectorAll("[data-cell-index]")].sort(
    (a, b) =>
      Number(a.getAttribute("data-cell-index")) -
      Number(b.getAttribute("data-cell-index")),
  );
  const texts: string[] = [];
  for (const cell of cells) {
    if (cell.getAttribute("data-cell-blank") === "true") continue;
    const t = cell.querySelector("text")?.textContent;
    if (t) texts.push(t);
  }
  return { text: texts.join(" "), cells: texts.length };
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
    const h = img.naturalHeight || 200;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
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

export function EntvizPill(props: EntvizPillProps) {
  const {
    value, targetAr, fontSizePt, note,
    showIcon = true, maxWidth, locale, messages: overrides,
    className, style, onExpand, onCopy, onError,
  } = props;

  const { locale: resolved, messages: base } = useMemo(
    () => resolveMessages(locale),
    [locale],
  );
  const m: Messages = { ...base, ...overrides };
  const rtl = isRtlLocale(resolved);

  const opts: RenderOptions = { targetAr, fontSizePt, note };
  const { type, svg, error } = useMemo(() => {
    try {
      const ci = classifyInput(value.trim());
      return { type: prettyType(ci.typeName), svg: render(value, opts), error: null as string | null };
    } catch (e) {
      return { type: null, svg: null, error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, targetAr, fontSizePt, note]);

  useEffect(() => {
    if (error && onError) onError(error);
  }, [error, onError]);

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const wrapRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Dismiss popover/menu on Escape (return focus to the pill) and outside-click.
  useEffect(() => {
    if (!expanded && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setExpanded(false); setMenuOpen(false); pillRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false); setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [expanded, menuOpen]);

  const toggleExpand = () => {
    setMenuOpen(false);
    setExpanded((v) => { const n = !v; if (n) onExpand?.(); return n; });
  };

  const doCopy = async (kind: CopyKind) => {
    setMenuOpen(false);
    try {
      if (kind === "value") {
        await navigator.clipboard.writeText(value);
        const unit = /^hex·/.test(type ?? "") ? "hex chars" : "chars";
        flash(fmt(m.copiedValue, { n: value.length, unit }));
      } else if (kind === "comparison") {
        if (!svg) throw new Error("no render");
        const { text, cells } = comparisonTextFromSvg(svg);
        await navigator.clipboard.writeText(text);
        flash(fmt(m.copiedComparison, { n: cells }));
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

  const label = type ?? "unrenderable";
  const ariaLabel = fmt(m.ariaView, { type: label });

  return (
    <span
      ref={wrapRef}
      dir={rtl ? "rtl" : undefined}
      className={className}
      style={{ position: "relative", display: "inline-flex", verticalAlign: "baseline", ...style }}
      onMouseEnter={(e) => e.currentTarget.classList.add("entviz-pill--hover")}
      onMouseLeave={(e) => e.currentTarget.classList.remove("entviz-pill--hover")}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: "0.35em",
          font: "inherit", color: "currentColor",
          padding: "0.1em 0.45em", borderRadius: "0.6em",
          border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
          background: "color-mix(in srgb, currentColor 6%, transparent)",
          whiteSpace: "nowrap", maxWidth, lineHeight: 1.3,
        }}
      >
        <button
          ref={pillRef}
          type="button"
          onClick={toggleExpand}
          title={m.view}
          aria-label={ariaLabel}
          aria-expanded={expanded}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.35em",
            font: "inherit", color: "inherit", background: "none", border: "none",
            padding: 0, margin: 0, cursor: "pointer", maxWidth: "100%",
          }}
        >
          {showIcon && (
            <span aria-hidden style={{
              display: "inline-grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
              width: "0.95em", height: "0.95em", borderRadius: 2, overflow: "hidden", flex: "0 0 auto",
              border: "0.5px solid color-mix(in srgb, currentColor 45%, transparent)",
            }}>
              {BADGE.map((c) => <span key={c} style={{ background: c }} />)}
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "clip", whiteSpace: "nowrap", opacity: type ? 1 : 0.6 }}>
            {label}
          </span>
        </button>

        {/* Fork A-(c): kebab visible on hover/focus for pointer+keyboard; copies
            are always reachable inside the expanded view too. */}
        <button
          type="button"
          className="entviz-pill__kebab"
          onClick={() => { setExpanded(false); setMenuOpen((v) => !v); }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={m.copyValue.replace(/ .*/, "…") /* "Copy…" */}
          style={{
            font: "inherit", color: "inherit", background: "none", border: "none",
            padding: "0 0.15em", margin: 0, cursor: "pointer", lineHeight: 1,
          }}
        >
          ⋮
        </button>
      </span>

      {menuOpen && (
        <span id={menuId} role="menu" style={menuStyle(rtl)}>
          {([
            ["value", m.copyValue],
            ["comparison", m.copyComparison],
            ["image", m.copyImage],
            ["svg", m.copySvg],
          ] as [CopyKind, string][]).map(([kind, lbl]) => (
            <button key={kind} role="menuitem" type="button" onClick={() => doCopy(kind)} style={menuItemStyle}>
              {lbl}
            </button>
          ))}
        </span>
      )}

      {expanded && (
        <span role="dialog" aria-label={ariaLabel} style={popoverStyle(rtl)}>
          {error ? (
            <span style={{ color: "#b00020", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{error}</span>
          ) : (
            <Entviz value={value} targetAr={targetAr} fontSizePt={fontSizePt} note={note} style={{ width: 240, display: "block" }} />
          )}
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              ["value", m.copyValue],
              ["comparison", m.copyComparison],
              ["image", m.copyImage],
              ["svg", m.copySvg],
            ] as [CopyKind, string][]).map(([kind, lbl]) => (
              <button key={kind} type="button" onClick={() => doCopy(kind)} style={copyBtnStyle} disabled={!svg && kind !== "value"}>
                {lbl}
              </button>
            ))}
          </span>
        </span>
      )}

      <span aria-live="polite" style={{ position: "absolute", clip: "rect(0 0 0 0)", width: 1, height: 1, overflow: "hidden" }}>
        {toast}
      </span>
      {toast && <span style={toastStyle(rtl)}>{toast}</span>}

      <style>{`
        .entviz-pill__kebab { opacity: 0; transition: opacity .12s; }
        .entviz-pill--hover .entviz-pill__kebab,
        .entviz-pill__kebab:focus-visible { opacity: 0.7; }
      `}</style>
    </span>
  );
}

const menuStyle = (rtl: boolean): React.CSSProperties => ({
  position: "absolute", top: "100%", [rtl ? "right" : "left"]: 0, marginTop: 4, zIndex: 20,
  display: "flex", flexDirection: "column", minWidth: 200,
  background: "#fff", color: "#1a1a2e", border: "1px solid #ddd", borderRadius: 8,
  boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: 4, font: "13px system-ui, sans-serif",
});
const menuItemStyle: React.CSSProperties = {
  textAlign: "start", background: "none", border: "none", borderRadius: 6,
  padding: "7px 10px", cursor: "pointer", font: "inherit", color: "inherit",
};
const popoverStyle = (rtl: boolean): React.CSSProperties => ({
  position: "absolute", top: "100%", [rtl ? "right" : "left"]: 0, marginTop: 6, zIndex: 20,
  display: "flex", flexDirection: "column", gap: 10, alignItems: "start",
  background: "#fff", border: "1px solid #e6e6f0", borderRadius: 12, padding: 14,
  boxShadow: "0 8px 30px rgba(0,0,0,.16)", font: "13px system-ui, sans-serif",
});
const copyBtnStyle: React.CSSProperties = {
  background: "#eef0ff", color: "#3b34b0", border: "none", borderRadius: 7,
  padding: "6px 10px", fontSize: 12, cursor: "pointer",
};
const toastStyle = (rtl: boolean): React.CSSProperties => ({
  position: "absolute", top: "100%", [rtl ? "left" : "right"]: 0, marginTop: 6, zIndex: 25,
  background: "#1a1a2e", color: "#fff", borderRadius: 6, padding: "5px 9px",
  fontSize: 11, whiteSpace: "nowrap", font: "11px system-ui, sans-serif",
});

export default EntvizPill;
