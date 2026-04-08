// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  waitWithTimeout,
  debounce,
  roundTo,
  clamp,
  formatHourString,
  safeParseFloat,
  deepClone,
  unique,
  isDefined,
  slugify,
  timeToMinutes,
  minutesToTime,
  checkIsEditorContext,
  Logger,
} from "../src/utils.js";

// ─── waitWithTimeout ──────────────────────────────────────────────────────────
describe("waitWithTimeout", () => {
  it("resolves when the promise completes in time", async () => {
    await expect(waitWithTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects with Timeout when the promise exceeds the limit", async () => {
    const never = new Promise(() => {});
    await expect(waitWithTimeout(never, 10)).rejects.toThrow("Timeout");
  });

  it("rejects with the promise error if it rejects before the timeout", async () => {
    await expect(
      waitWithTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });
});

// ─── debounce ─────────────────────────────────────────────────────────────────
describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not call the function before the interval", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("x");
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls the function after the interval", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("x");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("x");
  });

  it("resets the timer on each invocation", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    vi.advanceTimersByTime(50);
    d("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("propagates all arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d(1, 2, 3);
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });
});

// ─── roundTo ──────────────────────────────────────────────────────────────────
describe("roundTo", () => {
  it("rounds to 1 decimal by default", () => expect(roundTo(1.25)).toBe(1.3));
  it("rounds to N specified decimals", () => expect(roundTo(1.2567, 2)).toBe(1.26));
  it("rounds to 0 decimals", () => expect(roundTo(1.6, 0)).toBe(2));
  it("handles negative numbers", () => expect(roundTo(-1.25, 1)).toBe(-1.2));
});

// ─── clamp ────────────────────────────────────────────────────────────────────
describe("clamp", () => {
  it("returns the value when it is in the range", () => expect(clamp(5, 0, 10)).toBe(5));
  it("returns the minimum when below", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("returns the maximum when above", () => expect(clamp(15, 0, 10)).toBe(10));
  it("handles min === max", () => expect(clamp(99, 5, 5)).toBe(5));
});

// ─── formatHourString ─────────────────────────────────────────────────────────
describe("formatHourString", () => {
  it("adds a zero before a single digit (base 0)", () => expect(formatHourString(3, 0)).toBe("03"));
  it("adds the base offset", () => expect(formatHourString(0, 1)).toBe("01"));
  it("handles double digits", () => expect(formatHourString(12, 0)).toBe("12"));
  it("uses base 0 as default", () => expect(formatHourString(7)).toBe("07"));
});

// ─── safeParseFloat ───────────────────────────────────────────────────────────
describe("safeParseFloat", () => {
  it("parses a valid float", () => expect(safeParseFloat("3.14")).toBe(3.14));
  it("returns null for NaN with missing default", () => expect(safeParseFloat("abc")).toBeNull());
  it("returns the specified default for NaN", () => expect(safeParseFloat("abc", 0)).toBe(0));
  it("parses a string integer", () => expect(safeParseFloat("42")).toBe(42));
});

// ─── deepClone ────────────────────────────────────────────────────────────────
describe("deepClone", () => {
  it("creates an independent copy", () => {
    const obj = { a: { b: 1 } };
    const clone = deepClone(obj);
    clone.a.b = 99;
    expect(obj.a.b).toBe(1);
  });

  it("copies nested arrays", () => {
    const obj = { arr: [1, 2, 3] };
    const clone = deepClone(obj);
    clone.arr.push(4);
    expect(obj.arr).toHaveLength(3);
  });
});

// ─── unique ───────────────────────────────────────────────────────────────────
describe("unique", () => {
  it("removes duplicates", () => expect(unique([1, 2, 1, 3, 2])).toEqual([1, 2, 3]));
  it("handles an empty array", () => expect(unique([])).toEqual([]));
  it("handles strings", () => expect(unique(["a", "b", "a"])).toEqual(["a", "b"]));
});

// ─── isDefined ────────────────────────────────────────────────────────────────
describe("isDefined", () => {
  it("true for 0", () => expect(isDefined(0)).toBe(true));
  it("true for empty string", () => expect(isDefined("")).toBe(true));
  it("true for false", () => expect(isDefined(false)).toBe(true));
  it("false for null", () => expect(isDefined(null)).toBe(false));
  it("false for undefined", () => expect(isDefined(undefined)).toBe(false));
});

// ─── slugify ──────────────────────────────────────────────────────────────────
describe("slugify", () => {
  it("converts to lowercase slug", () => expect(slugify("Hello World")).toBe("hello_world"));
  it("removes accents", () => expect(slugify("Café")).toBe("cafe"));
  it("returns an empty string for falsy input", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
  it("removes leading and trailing underscores", () => expect(slugify("__test__")).toBe("test"));
  it("replaces special characters with underscores", () => expect(slugify("a!b@c")).toBe("a_b_c"));
});

// ─── timeToMinutes ────────────────────────────────────────────────────────────
describe("timeToMinutes", () => {
  it("00:00 → 0", () => expect(timeToMinutes("00:00")).toBe(0));
  it("01:00 → 60", () => expect(timeToMinutes("01:00")).toBe(60));
  it("23:59 → 1439", () => expect(timeToMinutes("23:59")).toBe(1439));
  it("handles null/undefined (→ 0)", () => {
    expect(timeToMinutes(null)).toBe(0);
    expect(timeToMinutes(undefined)).toBe(0);
  });
  it("partial string without ':'", () => expect(timeToMinutes("12")).toBe(720));
  it("wraps hour above 24", () => expect(timeToMinutes("25:00")).toBe(60)); // 25%24 = 1
  it("wraps minutes above 60", () => expect(timeToMinutes("00:61")).toBe(1)); // 61%60=1
});

// ─── minutesToTime ────────────────────────────────────────────────────────────
describe("minutesToTime", () => {
  it("0 → 00:00", () => expect(minutesToTime(0)).toBe("00:00"));
  it("60 → 01:00", () => expect(minutesToTime(60)).toBe("01:00"));
  it("1439 → 23:59", () => expect(minutesToTime(1439)).toBe("23:59"));
  it("negative values wrap (-1 → 23:59)", () => expect(minutesToTime(-1)).toBe("23:59"));
  it("1440 wraps to 00:00", () => expect(minutesToTime(1440)).toBe("00:00"));
  it("rounds decimals", () => expect(minutesToTime(60.7)).toBe("01:01"));
  it("highly negative values (-1440 → 00:00)", () => expect(minutesToTime(-1440)).toBe("00:00"));
});

// ─── checkIsEditorContext ─────────────────────────────────────────────────────
describe("checkIsEditorContext", () => {
  it("false for standalone element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(checkIsEditorContext(el)).toBe(false);
    document.body.removeChild(el);
  });

  it("true when an ancestor is hui-card-preview", () => {
    const parent = document.createElement("hui-card-preview");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true when an ancestor is hui-card-editor", () => {
    const parent = document.createElement("hui-card-editor");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true when an ancestor is hui-dialog-edit-card", () => {
    const parent = document.createElement("hui-dialog-edit-card");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true when an ancestor is ha-dialog", () => {
    const parent = document.createElement("ha-dialog");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true when an ancestor is hui-edit-card", () => {
    const parent = document.createElement("hui-edit-card");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true when an ancestor is hui-card-options", () => {
    const parent = document.createElement("hui-card-options");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("false and no exception for an element that throws errors", () => {
    const faultyEl = {
      get tagName() {
        throw new Error("DOM error");
      },
    };
    expect(checkIsEditorContext(faultyEl)).toBe(false);
  });
});

// ─── Logger ───────────────────────────────────────────────────────────────────
describe("Logger", () => {
  let logSpy, warnSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("setEnabled(false): does not log normal messages", () => {
    Logger.setEnabled(false);
    logSpy.mockClear();
    Logger.log("TAG", "msg");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("setEnabled(true): logs normal messages", () => {
    Logger.setEnabled(true);
    logSpy.mockClear();
    Logger.log("TAG", "msg");
    expect(logSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "msg");
  });

  it("warn is silent when disabled", () => {
    Logger.setEnabled(false);
    warnSpy.mockClear();
    Logger.warn("TAG", "warn");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warn logs when enabled", () => {
    Logger.setEnabled(true);
    warnSpy.mockClear();
    Logger.warn("TAG", "warn");
    expect(warnSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "warn");
  });

  it("error always logs regardless of state", () => {
    Logger.setEnabled(false);
    errorSpy.mockClear();
    Logger.error("TAG", "err");
    expect(errorSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "err");
  });

  it("shorthand methods delegate correctly", () => {
    Logger.setEnabled(true);
    logSpy.mockClear();

    Logger.state("s");
    Logger.load("l");
    Logger.save("v");
    Logger.sel("sel");
    Logger.memo("m");
    Logger.diff("d");
    Logger.key("k");
    Logger.base("b");
    Logger.chart("c");

    expect(logSpy).toHaveBeenCalledTimes(9);
    expect(logSpy).toHaveBeenCalledWith("[CRONOSTAR] [STATE]", "s");
    expect(logSpy).toHaveBeenCalledWith("[CRONOSTAR] [CHART]", "c");
  });

  it("window.Logger is set to the exported Logger", () => {
    // utils.js sets window.Logger = Logger at import time
    expect(window.Logger).toBeDefined();
    expect(typeof window.Logger.log).toBe("function");
  });
});
