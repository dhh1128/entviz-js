import { defineConfig } from "vite";

// No @vitejs/plugin-react: the app is small and Vite's default transform handles
// .tsx (JSX, automatic runtime) fine. We trade React Fast Refresh (a
// paste-and-build playground doesn't need it) for a smaller, lower-churn
// dependency surface. @entviz/react and @entviz/core resolve to the live
// workspace source, so edits to the component/renderer show up here immediately.
export default defineConfig({});
