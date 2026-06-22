import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Entviz } from "../src/Entviz.ts";

// TST-F1: the React wrapper had zero tests. Render it through react-dom/server
// (so the useMemo hook runs in a real render) and assert the success path, the
// accessible labels, and the error/fallback path (with and without onError).

const HEX = "0123456789abcdef0123456789abcdef";

test("Entviz: renders the entviz SVG inline with a default aria-label", () => {
  const html = renderToStaticMarkup(createElement(Entviz, { value: HEX }));
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="entviz fingerprint"/);
  assert.match(html, /<svg/);
  assert.match(html, /data-entviz-version="v10"/);
});

test("Entviz: a custom title overrides the aria-label; className/style pass through", () => {
  const html = renderToStaticMarkup(
    createElement(Entviz, { value: HEX, title: "my key", className: "fp", style: { width: 64 } }),
  );
  assert.match(html, /aria-label="my key"/);
  assert.match(html, /class="fp"/);
  assert.match(html, /width:64px/);
});

test("Entviz: the default aria-label folds in the user note (PSY-JS-F3)", () => {
  const html = renderToStaticMarkup(createElement(Entviz, { value: HEX, note: "git" }));
  assert.match(html, /aria-label="entviz fingerprint, note git"/);
});

test("Entviz: a render error calls onError and renders the fallback span (no svg)", () => {
  const errors: string[] = [];
  const html = renderToStaticMarkup(
    createElement(Entviz, { value: HEX, note: "toolongnote", onError: (m) => errors.push(m) }),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /note/i);
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /aria-label="entviz \(render error\)"/);
});

test("Entviz: an error without an onError handler still renders the fallback safely", () => {
  const html = renderToStaticMarkup(
    createElement(Entviz, { value: HEX, note: "toolongnote", title: "labelled" }),
  );
  assert.doesNotMatch(html, /<svg/);
  // The custom title labels the fallback too.
  assert.match(html, /aria-label="labelled"/);
});
