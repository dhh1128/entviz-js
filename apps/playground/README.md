# @entviz/playground

A tiny local dev playground for the [`@entviz/react`](../../packages/react)
component — **not published**. Paste a high-entropy value, hit **Build**, and the
`<Entviz/>` component renders; the sliders tweak its props (`targetAr`,
`fontSizePt`, `note`, and the display width) live.

It imports `@entviz/react` / `@entviz/core` straight from the workspace source,
so any change you make to the component or the renderer shows up here on reload —
handy for eyeballing affordances and prototyping new features.

## Run

```sh
npm install            # once, from the repo root
npm run dev -w @entviz/playground
# → http://localhost:5173
```

`npm run build -w @entviz/playground` produces a browser bundle; CI runs this on
every PR as the proof that `@entviz/core` stays browser-bundleable (isomorphic).

> No `@vitejs/plugin-react`, so there's no React Fast Refresh — editing a
> component triggers a full page reload. That's a deliberate trade for a smaller
> dependency surface; a paste-and-build playground doesn't need HMR state.
