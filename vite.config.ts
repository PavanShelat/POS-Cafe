import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Vite bakes these into the bundle at build time. Without them the app throws
// "supabaseUrl is required" on load and shows a blank page, so a production build
// fails instead, and the host keeps serving the last working deployment.
const REQUIRED_BUILD_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

function assertBuildEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const missing = REQUIRED_BUILD_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Set them in your host's environment variables ` +
        `(Vercel: Settings → Environment Variables, Production) and build again.`
    );
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") assertBuildEnv(mode);

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": "http://localhost:8787",
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Libraries that rarely change get their own chunks, so browsers keep them
          // cached across deploys and no single chunk passes Vite's 500 kB warning.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@radix-ui")) return "radix";
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          },
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
