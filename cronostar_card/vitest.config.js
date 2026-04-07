import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: true,
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],

    coverage: {
      provider: "v8",
      all: true,
      clean: true,
      cleanOnRerun: true,
      reportOnFailure: true,
      reporter: ["text", "text-summary", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js"],
      exclude: [
        "src/**/*.test.js",
        "src/**/*.spec.js",
        "tests/**",
        "node_modules/**",
        "dist/**",
        "coverage/**",
      ],
    },
  },
});
