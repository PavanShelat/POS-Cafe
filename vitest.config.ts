import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        // API tests mock Prisma and Supabase, so they never touch a real database.
        extends: true,
        test: {
          name: "server",
          environment: "node",
          setupFiles: ["./server/test/setup.js"],
          include: ["server/**/*.test.js"],
        },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
