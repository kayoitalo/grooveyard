import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: true,
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
