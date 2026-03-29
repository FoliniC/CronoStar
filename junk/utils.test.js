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
  it("risolve quando la promise si completa in tempo", async () => {
    await expect(waitWithTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rigetta con Timeout quando la promise supera il limite", async () => {
    const never = new Promise(() => {});
    await expect(waitWithTimeout(never, 10)).rejects.toThrow("Timeout");
  });

  it("rigetta con l'errore della promise se questa rigetta prima del timeout", async () => {
    await expect(
      waitWithTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });
});

// ─── debounce ─────────────────────────────────────────────────────────────────
describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("non chiama la funzione prima dell'intervallo", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("x");
    expect(fn).not.toHaveBeenCalled();
  });

  it("chiama la funzione dopo l'intervallo", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("x");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("x");
  });

  it("resetta il timer a ogni invocazione", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    vi.advanceTimersByTime(50);
    d("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("propaga tutti gli argomenti", () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d(1, 2, 3);
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });
});

// ─── roundTo ──────────────────────────────────────────────────────────────────
describe("roundTo", () => {
  it("arrotonda a 1 decimale di default", () => expect(roundTo(1.25)).toBe(1.3));
  it("arrotonda a N decimali specificati", () => expect(roundTo(1.2567, 2)).toBe(1.26));
  it("arrotonda a 0 decimali", () => expect(roundTo(1.6, 0)).toBe(2));
  it("gestisce numeri negativi", () => expect(roundTo(-1.25, 1)).toBe(-1.2));
});

// ─── clamp ────────────────────────────────────────────────────────────────────
describe("clamp", () => {
  it("ritorna il valore quando è nell'intervallo", () => expect(clamp(5, 0, 10)).toBe(5));
  it("ritorna il minimo quando sotto", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("ritorna il massimo quando sopra", () => expect(clamp(15, 0, 10)).toBe(10));
  it("gestisce min === max", () => expect(clamp(99, 5, 5)).toBe(5));
});

// ─── formatHourString ─────────────────────────────────────────────────────────
describe("formatHourString", () => {
  it("aggiunge zero davanti a cifra singola (base 0)", () => expect(formatHourString(3, 0)).toBe("03"));
  it("aggiunge l'offset di base", () => expect(formatHourString(0, 1)).toBe("01"));
  it("gestisce doppia cifra", () => expect(formatHourString(12, 0)).toBe("12"));
  it("usa base 0 come default", () => expect(formatHourString(7)).toBe("07"));
});

// ─── safeParseFloat ───────────────────────────────────────────────────────────
describe("safeParseFloat", () => {
  it("parsa un float valido", () => expect(safeParseFloat("3.14")).toBe(3.14));
  it("ritorna null per NaN con default assente", () => expect(safeParseFloat("abc")).toBeNull());
  it("ritorna il default specificato per NaN", () => expect(safeParseFloat("abc", 0)).toBe(0));
  it("parsa un numero intero stringa", () => expect(safeParseFloat("42")).toBe(42));
});

// ─── deepClone ────────────────────────────────────────────────────────────────
describe("deepClone", () => {
  it("crea una copia indipendente", () => {
    const obj = { a: { b: 1 } };
    const clone = deepClone(obj);
    clone.a.b = 99;
    expect(obj.a.b).toBe(1);
  });

  it("copia array annidati", () => {
    const obj = { arr: [1, 2, 3] };
    const clone = deepClone(obj);
    clone.arr.push(4);
    expect(obj.arr).toHaveLength(3);
  });
});

// ─── unique ───────────────────────────────────────────────────────────────────
describe("unique", () => {
  it("rimuove i duplicati", () => expect(unique([1, 2, 1, 3, 2])).toEqual([1, 2, 3]));
  it("gestisce un array vuoto", () => expect(unique([])).toEqual([]));
  it("gestisce stringhe", () => expect(unique(["a", "b", "a"])).toEqual(["a", "b"]));
});

// ─── isDefined ────────────────────────────────────────────────────────────────
describe("isDefined", () => {
  it("true per 0", () => expect(isDefined(0)).toBe(true));
  it("true per stringa vuota", () => expect(isDefined("")).toBe(true));
  it("true per false", () => expect(isDefined(false)).toBe(true));
  it("false per null", () => expect(isDefined(null)).toBe(false));
  it("false per undefined", () => expect(isDefined(undefined)).toBe(false));
});

// ─── slugify ──────────────────────────────────────────────────────────────────
describe("slugify", () => {
  it("converte in slug minuscolo", () => expect(slugify("Hello World")).toBe("hello_world"));
  it("rimuove gli accenti", () => expect(slugify("Café")).toBe("cafe"));
  it("ritorna stringa vuota per input falsy", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
  it("rimuove underscore iniziali e finali", () => expect(slugify("__test__")).toBe("test"));
  it("rimpiazza caratteri speciali con underscore", () => expect(slugify("a!b@c")).toBe("a_b_c"));
});

// ─── timeToMinutes ────────────────────────────────────────────────────────────
describe("timeToMinutes", () => {
  it("00:00 → 0", () => expect(timeToMinutes("00:00")).toBe(0));
  it("01:00 → 60", () => expect(timeToMinutes("01:00")).toBe(60));
  it("23:59 → 1439", () => expect(timeToMinutes("23:59")).toBe(1439));
  it("gestisce null/undefined (→ 0)", () => {
    expect(timeToMinutes(null)).toBe(0);
    expect(timeToMinutes(undefined)).toBe(0);
  });
  it("string parziale senza ':'", () => expect(timeToMinutes("12")).toBe(720));
  it("wrap dell'ora sopra 24", () => expect(timeToMinutes("25:00")).toBe(60)); // 25%24 = 1
  it("wrap dei minuti sopra 60", () => expect(timeToMinutes("00:61")).toBe(1)); // 61%60=1
});

// ─── minutesToTime ────────────────────────────────────────────────────────────
describe("minutesToTime", () => {
  it("0 → 00:00", () => expect(minutesToTime(0)).toBe("00:00"));
  it("60 → 01:00", () => expect(minutesToTime(60)).toBe("01:00"));
  it("1439 → 23:59", () => expect(minutesToTime(1439)).toBe("23:59"));
  it("valori negativi wrappano (-1 → 23:59)", () => expect(minutesToTime(-1)).toBe("23:59"));
  it("1440 wrappa a 00:00", () => expect(minutesToTime(1440)).toBe("00:00"));
  it("arrotonda decimali", () => expect(minutesToTime(60.7)).toBe("01:01"));
  it("valori molto negativi (-1440 → 00:00)", () => expect(minutesToTime(-1440)).toBe("00:00"));
});

// ─── checkIsEditorContext ─────────────────────────────────────────────────────
describe("checkIsEditorContext", () => {
  it("false per elemento standalone", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(checkIsEditorContext(el)).toBe(false);
    document.body.removeChild(el);
  });

  it("true quando un antenato è hui-card-preview", () => {
    const parent = document.createElement("hui-card-preview");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true quando un antenato è hui-card-editor", () => {
    const parent = document.createElement("hui-card-editor");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true quando un antenato è hui-dialog-edit-card", () => {
    const parent = document.createElement("hui-dialog-edit-card");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true quando un antenato è ha-dialog", () => {
    const parent = document.createElement("ha-dialog");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true quando un antenato è hui-edit-card", () => {
    const parent = document.createElement("hui-edit-card");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("true quando un antenato è hui-card-options", () => {
    const parent = document.createElement("hui-card-options");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    expect(checkIsEditorContext(child)).toBe(true);
    document.body.removeChild(parent);
  });

  it("false e nessuna eccezione per elemento che lancia errori", () => {
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

  it("setEnabled(false): non logga i messaggi normali", () => {
    Logger.setEnabled(false);
    logSpy.mockClear();
    Logger.log("TAG", "msg");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("setEnabled(true): logga i messaggi normali", () => {
    Logger.setEnabled(true);
    logSpy.mockClear();
    Logger.log("TAG", "msg");
    expect(logSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "msg");
  });

  it("warn è silente quando disabilitato", () => {
    Logger.setEnabled(false);
    warnSpy.mockClear();
    Logger.warn("TAG", "warn");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warn logga quando abilitato", () => {
    Logger.setEnabled(true);
    warnSpy.mockClear();
    Logger.warn("TAG", "warn");
    expect(warnSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "warn");
  });

  it("error logga sempre indipendentemente dallo stato", () => {
    Logger.setEnabled(false);
    errorSpy.mockClear();
    Logger.error("TAG", "err");
    expect(errorSpy).toHaveBeenCalledWith("[CRONOSTAR] [TAG]", "err");
  });

  it("i metodi shorthand delegano correttamente", () => {
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

  it("window.Logger è impostato al Logger esportato", () => {
    // utils.js esegue window.Logger = Logger al momento dell'import
    expect(window.Logger).toBeDefined();
    expect(typeof window.Logger.log).toBe("function");
  });
});
