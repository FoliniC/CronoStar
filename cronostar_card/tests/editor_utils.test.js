// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  slugify,
  pad2,
  getHoursList,
  escapeHtml,
} from "../src/utils/editor_utils.js";

describe("editor_utils", () => {
  it("slugify should normalize strings", () => {
    expect(slugify("Hello World")).toBe("hello_world");
    expect(slugify("Café déjà vu")).toBe("cafe_deja_vu");
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
  });

  it("pad2 should left-pad numbers", () => {
    expect(pad2(5)).toBe("05");
    expect(pad2(12)).toBe("12");
    expect(pad2(0)).toBe("00");
  });

  it("getHoursList should support base 0 hourly", () => {
    const list = getHoursList(0);
    expect(list).toHaveLength(24);
    expect(list[0]).toBe("00");
    expect(list[23]).toBe("23");
  });

  it("getHoursList should support base 1 hourly legacy mode", () => {
    const list = getHoursList(1, 60);
    expect(list).toHaveLength(24);
    expect(list[0]).toBe("01");
    expect(list[23]).toBe("24");
  });

  it("getHoursList should support sub-hour intervals", () => {
    const list = getHoursList(0, 30);
    expect(list).toHaveLength(48);
    expect(list[0]).toBe("00");
    expect(list[47]).toBe("47");
  });

  it("getHoursList should treat string '1' as base 1", () => {
    const list = getHoursList("1", 60);
    expect(list[0]).toBe("01");
    expect(list[23]).toBe("24");
  });

  it("escapeHtml should escape special chars", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });

  it("escapeHtml should return original input on catch", () => {
    const bad = {
      toString() {
        throw new Error("boom");
      },
    };
    expect(escapeHtml(bad)).toBe(bad);
  });
});
