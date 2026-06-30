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
    // The heaviest walk tests drive ~30 steps over a 22-cell figure, re-parsing
    // the SVG each render; under v8 coverage instrumentation that can exceed the
    // 5s default on a loaded machine. Give headroom — correctness is fine; they
    // pass well under this without coverage.
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text"],
      thresholds: { lines: 100, functions: 100, branches: 90 },
    },
  },
});
