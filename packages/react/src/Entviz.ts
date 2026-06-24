/**
 * <Entviz /> — a React component that renders a high-entropy value as an entviz
 * SVG, making it trivial to drop a comparable visual fingerprint into any web
 * or mobile UI. A thin wrapper over the certified @entviz/core renderer.
 */
import React from "react";
import { render, type RenderOptions } from "@entviz/core";

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
  const { value, targetAr, fontSizePt, note, className, style, title, onError } = props;
  const svg = React.useMemo(() => {
    const opts: RenderOptions = { targetAr, fontSizePt, note };
    try {
      return render(value, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (onError) onError(msg);
      return null;
    }
  }, [value, targetAr, fontSizePt, note, onError]);

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
  return React.createElement("span", {
    className,
    style,
    role: "img",
    "aria-label": title ?? defaultLabel,
    dangerouslySetInnerHTML: { __html: svg },
  });
}

export default Entviz;
