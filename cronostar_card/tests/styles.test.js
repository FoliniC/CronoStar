// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { cardStyles } from "../src/styles.js";

describe("styles.js", () => {
  it("should export cardStyles as a CSSResult", () => {
    expect(cardStyles).toBeDefined();
    // In Lit, css result has a _styleSheet or cssText property
    expect(cardStyles.cssText).toBeDefined();
    expect(typeof cardStyles.cssText).toBe("string");
    expect(cardStyles.cssText).toContain("ha-card");
  });
});
