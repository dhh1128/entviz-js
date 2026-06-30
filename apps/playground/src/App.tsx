import { useMemo, useState } from "react";
import { Entviz, EntvizPill, EntvizCompare, SUPPORTED_LOCALES } from "@entviz/react";
import { render as renderEntviz } from "@entviz/core";

// Showcase inputs spanning the parsers the port supports (hex/UUID/ETH/text).
const PRESETS: { label: string; value: string }[] = [
  { label: "hex (256-bit)", value: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
  { label: "UUID", value: "550e8400-e29b-41d4-a716-446655440000" },
  { label: "ETH (EIP-55)", value: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" },
  { label: "text → base64url", value: "The quick brown fox jumps over the lazy dog" },
];

function randomHex(bytes: number): string {
  const u8 = new Uint8Array(bytes);
  crypto.getRandomValues(u8);
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
}

const mono = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function App() {
  const [draft, setDraft] = useState(PRESETS[0].value);
  const [value, setValue] = useState(PRESETS[0].value);
  const [targetAr, setTargetAr] = useState(1.0);
  const [fontSizePt, setFontSizePt] = useState(12);
  const [note, setNote] = useState("");
  const [width, setWidth] = useState(280);
  const [locale, setLocale] = useState(""); // "" = auto-detect from the browser
  const [pillLabel, setPillLabel] = useState("");
  const [showType, setShowType] = useState(true);

  const opts = { targetAr, fontSizePt, note: note || null };

  // Surface the renderer's error message in the parent's OWN render (the
  // component swallows errors via onError + an empty fallback). Computing it
  // here — rather than via the child's onError — avoids a cross-component
  // setState during render, and doubles as a live demo of the core API.
  const error = useMemo(() => {
    try {
      renderEntviz(value, opts);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [value, targetAr, fontSizePt, note]);

  const build = () => setValue(draft.trim());
  const surprise = () => {
    const v = randomHex(32);
    setDraft(v);
    setValue(v);
  };

  return (
    <div style={{ fontFamily: sans, color: "#1a1a2e", maxWidth: 980, margin: "0 auto", padding: "32px 20px 64px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: "0 0 4px", letterSpacing: -0.5 }}>
          entviz <span style={{ color: "#6c63ff" }}>playground</span>
        </h1>
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
          Paste a high-entropy value and hit Build to render the{" "}
          <code style={{ fontFamily: mono }}>&lt;Entviz/&gt;</code> React component. Tweak the props live.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: 28, alignItems: "start" }}>
        {/* Controls */}
        <section>
          <label style={labelStyle}>Entropy</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") build(); }}
            spellCheck={false}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, fontSize: 13, padding: 10, borderRadius: 8, border: "1px solid #ccc", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, margin: "8px 0 4px", flexWrap: "wrap" }}>
            <button onClick={build} style={primaryBtn}>Build ⌘↵</button>
            <button onClick={surprise} style={ghostBtn}>Randomize</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { setDraft(p.value); setValue(p.value); }} style={chip}>
                {p.label}
              </button>
            ))}
          </div>

          <label style={labelStyle}>
            Target aspect ratio (W/H): <b>{targetAr.toFixed(2)}</b>
          </label>
          <input type="range" min={0.25} max={4} step={0.05} value={targetAr}
            onChange={(e) => setTargetAr(Number(e.target.value))} style={rangeStyle} />

          <label style={labelStyle}>
            Font size (pt): <b>{fontSizePt}</b>
          </label>
          <input type="range" min={6} max={30} step={1} value={fontSizePt}
            onChange={(e) => setFontSizePt(Number(e.target.value))} style={rangeStyle} />

          <label style={labelStyle}>
            Note <span style={{ fontWeight: 400, color: "#888" }}>(≤10 printable-ASCII chars; never hashed)</span>
          </label>
          <input type="text" value={note} maxLength={20} placeholder="e.g. git"
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }} />

          <label style={labelStyle}>
            Display width (px): <b>{width}</b>
          </label>
          <input type="range" min={80} max={480} step={10} value={width}
            onChange={(e) => setWidth(Number(e.target.value))} style={rangeStyle} />

          <label style={labelStyle}>
            Pill locale <span style={{ fontWeight: 400, color: "#888" }}>(chrome only — never the value; RTL mirrors chrome)</span>
          </label>
          <select value={locale} onChange={(e) => setLocale(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }}>
            <option value="">auto (browser)</option>
            {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          <label style={labelStyle}>
            Pill label <span style={{ fontWeight: 400, color: "#888" }}>(first-party host text — trusted, unlike the note)</span>
          </label>
          <input type="text" value={pillLabel} placeholder="e.g. signing-key"
            onChange={(e) => setPillLabel(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 10 }} />
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={showType} onChange={(e) => setShowType(e.target.checked)} />
            Show type label
          </label>
        </section>

        {/* Preview */}
        <section>
          <label style={labelStyle}>Preview</label>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 24, background: "#fafafe", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 220 }}>
            {error ? (
              <div style={{ color: "#b00020", fontFamily: mono, fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>render rejected</div>
                {error}
              </div>
            ) : (
              <Entviz
                value={value}
                targetAr={targetAr}
                fontSizePt={fontSizePt}
                note={note || null}
                controls
                onResize={setFontSizePt}
                onReshape={(ar) => setTargetAr(Number(ar.toFixed(2)))}
                style={width ? { width } : undefined}
                onError={(m) => console.warn("entviz onError:", m)}
              />
            )}
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            The −/+ buttons step a clean font-size ladder (or focus the figure and press
            <code style={{ fontFamily: mono }}> +</code> / <code style={{ fontFamily: mono }}>−</code> /
            <code style={{ fontFamily: mono }}> 0</code>); the little grids reshape the grid. Both are wired to
            the sliders above, so they stay in sync.
          </p>

          <label style={{ ...labelStyle, marginTop: 16 }}>Props</label>
          <pre style={{ fontFamily: mono, fontSize: 12, background: "#1a1a2e", color: "#e6e6f0", padding: 14, borderRadius: 10, overflowX: "auto", margin: 0 }}>
{`<Entviz
  value=${JSON.stringify(value.length > 40 ? value.slice(0, 40) + "…" : value)}
  targetAr={${targetAr}}
  fontSizePt={${fontSizePt}}
  note={${note ? JSON.stringify(note) : "null"}}
/>`}
          </pre>

          <label style={{ ...labelStyle, marginTop: 16 }}>
            Collapsed form (&lt;EntvizPill/&gt;) <span style={{ fontWeight: 400, color: "#888" }}>— click to expand · hover for the copy menu</span>
          </label>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: "18px 20px", background: "#fafafe", fontSize: 15, lineHeight: 2.1 }}>
            Run:{" "}
            <code style={{ fontFamily: mono, fontSize: 13 }}>
              gh secret save{" "}
              <EntvizPill value={value} label={pillLabel || undefined} showType={showType} targetAr={targetAr} fontSizePt={fontSizePt} note={note || null} locale={locale || undefined} onError={(m) => console.warn("pill:", m)} />
            </code>
            <br />
            Inherits the running font &amp; color:{" "}
            <EntvizPill value={value} label={pillLabel || undefined} showType={showType} targetAr={targetAr} fontSizePt={fontSizePt} note={note || null} locale={locale || undefined} />
            {" "}— and again without its badge:{" "}
            <EntvizPill value={value} label={pillLabel || undefined} showType={showType} showIcon={false} targetAr={targetAr} fontSizePt={fontSizePt} note={note || null} locale={locale || undefined} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Type only (the note stays inside the entviz, never on the pill). Copy menu: value vs. comparison text vs. image vs. SVG.
          </p>

          <label style={{ ...labelStyle, marginTop: 16 }}>
            Compare (&lt;EntvizCompare/&gt;) <span style={{ fontWeight: 400, color: "#888" }}>— check a reference value, entviz SVG, or image against yours (machine path · M1c)</span>
          </label>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: "18px 20px", background: "#fafafe" }}>
            <EntvizCompare value={value} targetAr={targetAr} fontSizePt={fontSizePt} note={note || null} locale={locale || undefined} onVerdict={(v) => console.log("verdict:", v)} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Paste/drop/pick/link the same value or its entviz SVG to see <code style={{ fontFamily: mono }}>=</code>, a different one for <code style={{ fontFamily: mono }}>≠</code>. A tampered or non-closed-profile SVG, a &gt;512-bit one, or anything ambiguous fails closed (no false “differ”). An image is disprove-only — it can show <code style={{ fontFamily: mono }}>≠</code> or “unknown”, never <code style={{ fontFamily: mono }}>=</code> (no OCR). Paste a value to also get <strong>Verify by walking the cells →</strong> — the guided human walk (M2): pick a size-aware target, then step through an unpredictable mix of text + gestalt checks. The two-party live ceremony (M3) comes next.
          </p>
        </section>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "0 0 6px", color: "#333" };
const rangeStyle: React.CSSProperties = { width: "100%", marginBottom: 16, accentColor: "#6c63ff" };
const primaryBtn: React.CSSProperties = { background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { background: "#fff", color: "#6c63ff", border: "1px solid #6c63ff", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const chip: React.CSSProperties = { background: "#eef0ff", color: "#3b34b0", border: "none", borderRadius: 999, padding: "5px 11px", fontSize: 12, cursor: "pointer" };
