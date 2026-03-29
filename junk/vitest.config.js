// vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: true,

    // Opzioni coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",

      // Includi SOLO i sorgenti effettivi (esclude test, build e dipendenze)
      include: ["src/**/*.js"],
      exclude: [
        "src/**/*.test.js",
        "src/**/*.spec.js",
        "tests/**",
        "cronostar_card/**",
        "node_modules/**",
      ],

      // Forza il calcolo della coverage anche sui file non importati dai test
      all: true,

      // Soglia 100% su tutto (commenta per sviluppo incrementale)
      // thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
