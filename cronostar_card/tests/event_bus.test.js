// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus, Events } from "../src/core/EventBus.js";

describe("EventBus", () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("should initialize with an empty listener map", () => {
    expect(bus._listeners.size).toBe(0);
  });

  it("should register a listener with on()", () => {
    const callback = vi.fn();
    bus.on("test-event", callback);
    expect(bus._listeners.has("test-event")).toBe(true);
    expect(bus._listeners.get("test-event")).toContain(callback);
  });

  it("should return an unsubscribe function from on()", () => {
    const callback = vi.fn();
    const unsubscribe = bus.on("test-event", callback);
    expect(typeof unsubscribe).toBe("function");
    
    unsubscribe();
    expect(bus._listeners.get("test-event")).not.toContain(callback);
  });

  it("should emit an event with correct data", () => {
    const callback = vi.fn();
    const data = { foo: "bar" };
    bus.on("test-event", callback);
    bus.emit("test-event", data);
    expect(callback).toHaveBeenCalledWith(data);
  });

  it("should do nothing if emit() is called for an event without listeners", () => {
    expect(() => bus.emit("no-listeners", "data")).not.toThrow();
  });

  it("should handle multiple listeners for the same event", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.on("test", cb1);
    bus.on("test", cb2);
    bus.emit("test", "data");
    expect(cb1).toHaveBeenCalledWith("data");
    expect(cb2).toHaveBeenCalledWith("data");
  });

  it("should remove a listener with off()", () => {
    const callback = vi.fn();
    bus.on("test", callback);
    bus.off("test", callback);
    bus.emit("test", "data");
    expect(callback).not.toHaveBeenCalled();
  });

  it("should not crash if off() is called for a non-existent event", () => {
    expect(() => bus.off("non-existent", () => {})).not.toThrow();
  });

  it("should do nothing if off() is called for an unregistered callback", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.on("test", cb1);
    bus.off("test", cb2);
    expect(bus._listeners.get("test")).toContain(cb1);
    expect(bus._listeners.get("test")).not.toContain(cb2);
    expect(bus._listeners.get("test")).toHaveLength(1);
  });

  it("should handle errors in callbacks without blocking emission to others", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cbError = vi.fn(() => { throw new Error("fail"); });
    const cbOk = vi.fn();
    
    bus.on("test", cbError);
    bus.on("test", cbOk);
    bus.emit("test", "data");
    
    expect(cbOk).toHaveBeenCalledWith("data");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should clear all listeners with clear()", () => {
    bus.on("a", () => {});
    bus.on("b", () => {});
    bus.clear();
    expect(bus._listeners.size).toBe(0);
  });

  it("should have event constants defined", () => {
    expect(Events.STATE_CHANGED).toBeDefined();
    expect(Events.CONFIG_CHANGED).toBeDefined();
  });
});
