import { defineConfig } from "vitest/config";

// Replaces the former `node --test --experimental-test-coverage` gate. The same
// floors are enforced here via v8 coverage: 100% lines, 100% functions, 90%
// branches of src/. jsdom gives the component a real DOM so we can assert on the
// rendered <span role="img"> + injected <svg>, including the error/fallback path.
export default defineConfig({
  // The component is authored with React.createElement, but the tests use JSX;
  // Vite's default transform (oxc) handles JSX with the automatic runtime, so no
  // @vitejs/plugin-react is needed.
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    // The heaviest walk tests drive ~30 steps over a 22-cell figure, recomputing
    // the render model each step; under v8 coverage on a loaded machine that can
    // run long. Give generous headroom — correctness is fine; they pass quickly
    // without coverage. (A per-render model memo would cut this; tracked as a
    // follow-up.)
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // index.ts is a pure re-export barrel — no executable statements to cover.
      exclude: ["src/index.ts"],
      reporter: ["text"],
      thresholds: { lines: 100, functions: 100, branches: 90 },
    },
  },
});
