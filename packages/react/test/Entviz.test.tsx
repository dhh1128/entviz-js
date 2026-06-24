import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Entviz } from "../src/Entviz.ts";

// Migrated from node:test + react-dom/server to Vitest + Testing Library + jsdom:
// the component now mounts into a real (simulated) DOM, so we assert on actual
// nodes (the <span role="img"> and the injected <svg>) instead of a markup
// string. Covers the success path, the accessible labels, prop pass-through, and
// the error/fallback path (with and without onError).

const HEX = "0123456789abcdef0123456789abcdef";

afterEach(cleanup);

const img = (c: HTMLElement) => c.querySelector('span[role="img"]') as HTMLElement;

describe("Entviz", () => {
  test("renders the entviz SVG inline with a default aria-label", () => {
    const { container } = render(<Entviz value={HEX} />);
    const span = img(container);
    expect(span).toBeTruthy();
    expect(span.getAttribute("aria-label")).toBe("entviz fingerprint");
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("data-entviz-version")).toBe("v11");
  });

  test("a custom title overrides the aria-label; className/style pass through", () => {
    const { container } = render(
      <Entviz value={HEX} title="my key" className="fp" style={{ width: 64 }} />,
    );
    const span = img(container);
    expect(span.getAttribute("aria-label")).toBe("my key");
    expect(span.classList.contains("fp")).toBe(true);
    expect(span.style.width).toBe("64px");
  });

  test("the default aria-label folds in the user note (PSY-JS-F3)", () => {
    const { container } = render(<Entviz value={HEX} note="git" />);
    expect(img(container).getAttribute("aria-label")).toBe("entviz fingerprint, note git");
  });

  test("a render error calls onError and renders the fallback span (no svg)", () => {
    const onError = vi.fn();
    const { container } = render(
      <Entviz value={HEX} note="toolongnote" onError={onError} />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/note/i);
    expect(container.querySelector("svg")).toBeNull();
    expect(img(container).getAttribute("aria-label")).toBe("entviz (render error)");
  });

  test("an error without an onError handler still renders the fallback safely", () => {
    const { container } = render(<Entviz value={HEX} note="toolongnote" title="labelled" />);
    expect(container.querySelector("svg")).toBeNull();
    // The custom title labels the fallback too.
    expect(img(container).getAttribute("aria-label")).toBe("labelled");
  });
});
