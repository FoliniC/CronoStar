import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: true,
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    printConsoleTrace: false,
    onConsoleLog(log) {
      const expectedNoise = [
        "[CRONOSTAR]",
        "[CronoStar]",
        "[CronoStarEditor]",
        "[CronoStar Editor]",
        "[Step5Summary]",
        "[DASHBOARD]",
        "Lit is in dev mode.",
        "HA Save button not found",
      ];

      if (expectedNoise.some((text) => log.includes(text))) {
        return false;
      }
    },

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
