// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus, Events } from "../src/core/EventBus.js";

describe("EventBus", () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("dovrebbe inizializzare con una mappa vuota di listener", () => {
    expect(bus._listeners.size).toBe(0);
  });

  it("dovrebbe registrare un listener con on()", () => {
    const callback = vi.fn();
    bus.on("test-event", callback);
    expect(bus._listeners.has("test-event")).toBe(true);
    expect(bus._listeners.get("test-event")).toContain(callback);
  });

  it("dovrebbe restituire una funzione di unsubscribe da on()", () => {
    const callback = vi.fn();
    const unsubscribe = bus.on("test-event", callback);
    expect(typeof unsubscribe).toBe("function");
    
    unsubscribe();
    expect(bus._listeners.get("test-event")).not.toContain(callback);
  });

  it("dovrebbe emettere un evento con i dati corretti", () => {
    const callback = vi.fn();
    const data = { foo: "bar" };
    bus.on("test-event", callback);
    bus.emit("test-event", data);
    expect(callback).toHaveBeenCalledWith(data);
  });

  it("non dovrebbe fare nulla se emit() viene chiamato per un evento senza listener", () => {
    expect(() => bus.emit("no-listeners", "data")).not.toThrow();
  });

  it("dovrebbe gestire più listener per lo stesso evento", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.on("test", cb1);
    bus.on("test", cb2);
    bus.emit("test", "data");
    expect(cb1).toHaveBeenCalledWith("data");
    expect(cb2).toHaveBeenCalledWith("data");
  });

  it("dovrebbe rimuovere un listener con off()", () => {
    const callback = vi.fn();
    bus.on("test", callback);
    bus.off("test", callback);
    bus.emit("test", "data");
    expect(callback).not.toHaveBeenCalled();
  });

  it("non dovrebbe crashare se off() viene chiamato per un evento inesistente", () => {
    expect(() => bus.off("non-existent", () => {})).not.toThrow();
  });

  it("non dovrebbe fare nulla se off() viene chiamato per un callback non registrato", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.on("test", cb1);
    bus.off("test", cb2);
    expect(bus._listeners.get("test")).toContain(cb1);
    expect(bus._listeners.get("test")).not.toContain(cb2);
    expect(bus._listeners.get("test")).toHaveLength(1);
  });

  it("dovrebbe gestire errori nei callback senza bloccare l'emissione agli altri", () => {
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

  it("dovrebbe pulire tutti i listener con clear()", () => {
    bus.on("a", () => {});
    bus.on("b", () => {});
    bus.clear();
    expect(bus._listeners.size).toBe(0);
  });

  it("dovrebbe avere le costanti degli eventi definite", () => {
    expect(Events.STATE_CHANGED).toBeDefined();
    expect(Events.CONFIG_CHANGED).toBeDefined();
  });
});
