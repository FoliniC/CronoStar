import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "../src/utils/logger_utils.js";

describe("logger_utils", () => {
  let debugSpy, infoSpy, warnSpy, errorSpy, logSpy;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debug log when enabled", () => {
    log("debug", true, "test");
    expect(debugSpy).toHaveBeenCalledWith("[CronoStar]", "test");
  });

  it("info log when enabled", () => {
    log("info", true, "test");
    expect(infoSpy).toHaveBeenCalledWith("[CronoStar]", "test");
  });

  it("warn log always (even when disabled)", () => {
    log("warn", false, "test");
    expect(warnSpy).toHaveBeenCalledWith("[CronoStar]", "test");
  });

  it("error log always (even when disabled)", () => {
    log("error", false, "test");
    expect(errorSpy).toHaveBeenCalledWith("[CronoStar]", "test");
  });

  it("default log when enabled", () => {
    log("other", true, "test");
    expect(logSpy).toHaveBeenCalledWith("[CronoStar]", "test");
  });

  it("no log when disabled (except warn/error)", () => {
    log("debug", false, "test");
    log("info", false, "test");
    log("other", false, "test");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
