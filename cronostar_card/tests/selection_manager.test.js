// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectionManager } from "../src/managers/selection_manager.js";
import { Events } from "../src/core/EventBus.js";

describe("SelectionManager", () => {
  let sm, ctx, stateManager;

  beforeEach(() => {
    stateManager = {
      getNumPoints: vi.fn(() => 10),
      getPointLabel: vi.fn((idx) => `Point ${idx}`),
    };

    ctx = {
      events: {
        on: vi.fn(),
        emit: vi.fn(),
      },
      getManager: vi.fn((name) => (name === "state" ? stateManager : null)),
      _card: {},
    };

    sm = new SelectionManager(ctx);
  });

  it("should initialize empty", () => {
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });

  it("selectPoint should select one point", () => {
    sm.selectPoint(5);
    expect(sm.getSelectedPoints()).toEqual([5]);
    expect(sm.getAnchor()).toBe(5);
    expect(ctx.events.emit).toHaveBeenCalledWith(
      Events.SELECTION_CHANGED,
      expect.any(Object),
    );
  });

  it("togglePoint should add/remove selection", () => {
    sm.togglePoint(3);
    expect(sm.isSelected(3)).toBe(true);
    expect(sm.getAnchor()).toBe(3);

    sm.togglePoint(3);
    expect(sm.isSelected(3)).toBe(false);
    expect(sm.getAnchor()).toBeNull();
  });

  it("togglePoint should re-anchor to first remaining selected point", () => {
    sm.selectIndices([1, 2]);
    sm.setAnchor(1);
    sm.togglePoint(1);
    expect(sm.getAnchor()).toBe(2);
  });

  it("selectRange should select forward range", () => {
    sm.selectPoint(2);
    sm.selectRange(5);
    expect(sm.getSelectedPoints()).toEqual([2, 3, 4, 5]);
  });

  it("selectRange should select reverse range", () => {
    sm.selectPoint(5);
    sm.selectRange(2);
    expect(sm.getSelectedPoints()).toEqual([2, 3, 4, 5]);
  });

  it("selectRange without anchor should fallback to selectPoint", () => {
    sm.selectRange(4);
    expect(sm.getSelectedPoints()).toEqual([4]);
  });

  it("selectIndices should ignore invalid entries", () => {
    sm.selectIndices([1, -1, 3, 1.2, 5]);
    expect(sm.getSelectedPoints()).toEqual([1, 3, 5]);
    expect(sm.getAnchor()).toBe(1);
  });

  it("selectIndices should preserve anchor when requested", () => {
    sm.selectPoint(5);
    sm.selectIndices([5, 6, 7], true);
    expect(sm.getAnchor()).toBe(5);
  });

  it("selectIndices should reset anchor when preserveAnchor is false", () => {
    sm.selectPoint(8);
    sm.selectIndices([3, 4], false);
    expect(sm.getAnchor()).toBe(3);
  });

  it("selectIndices should null anchor when all indices are invalid", () => {
    sm.selectPoint(2);
    sm.selectIndices([-1, 1.2], false);
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });

  it("selectAll should select all points", () => {
    sm.selectAll();
    expect(sm.getSelectedPoints().length).toBe(10);
    expect(sm.getAnchor()).toBe(0);
  });

  it("selectAll should return early when no state manager", () => {
    ctx.getManager.mockReturnValue(null);
    sm.selectAll();
    expect(sm.getSelectedPoints()).toEqual([]);
  });

  it("clearSelection should empty state", () => {
    sm.selectPoint(5);
    sm.clearSelection();
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });

  it("getActiveIndices should return selected points", () => {
    sm.selectPoint(5);
    expect(sm.getActiveIndices()).toEqual([5]);
  });

  it("getActiveIndices should return anchor when no selected points", () => {
    sm._anchorPoint = 2;
    expect(sm.getActiveIndices()).toEqual([2]);
  });

  it("getActiveIndices should return empty when nothing active", () => {
    expect(sm.getActiveIndices()).toEqual([]);
  });

  it("isAnchor should reflect current anchor", () => {
    sm.selectPoint(4);
    expect(sm.isAnchor(4)).toBe(true);
    expect(sm.isAnchor(3)).toBe(false);
  });

  it("setAnchor should emit only when index is selected", () => {
    sm.selectIndices([2, 3]);
    ctx.events.emit.mockClear();
    sm.setAnchor(3);
    expect(sm.getAnchor()).toBe(3);
    expect(ctx.events.emit).toHaveBeenCalled();

    ctx.events.emit.mockClear();
    sm.setAnchor(7);
    expect(sm.getAnchor()).toBe(3);
    expect(ctx.events.emit).not.toHaveBeenCalled();
  });

  it("should validate selection when schedule updates", () => {
    sm.selectPoint(8);
    stateManager.getNumPoints.mockReturnValue(5);

    const callback = ctx.events.on.mock.calls.find(
      (c) => c[0] === Events.SCHEDULE_UPDATED,
    )[1];
    callback();

    expect(sm.isSelected(8)).toBe(false);
    expect(sm.getAnchor()).toBeNull();
  });

  it("validateSelection should return early without state manager", () => {
    ctx.getManager.mockReturnValue(null);
    sm._selectedPoints.add(99);
    sm._validateSelection();
    expect(sm.isSelected(99)).toBe(true);
  });

  it("snapshot and restore should work", () => {
    sm.selectPoint(3);
    sm.snapshotSelection();
    sm.clearSelection();
    sm.restoreSelection();
    expect(sm.isSelected(3)).toBe(true);
  });

  it("snapshotSelection stores null when no active selection", () => {
    sm.snapshotSelection();
    expect(sm._snapshot).toBeNull();
  });

  it("restoreSelection should return early when no snapshot exists", () => {
    sm.restoreSelection();
    expect(sm.getSelectedPoints()).toEqual([]);
  });

  it("restoreSelection should not restore invalid anchor", () => {
    sm._snapshot = { points: [1, 2], anchor: 9 };
    sm.restoreSelection();
    expect(sm.getSelectedPoints()).toEqual([1, 2]);
    expect(sm.getAnchor()).toBe(1);
  });

  it("logSelection should work without state manager", () => {
    ctx.getManager.mockReturnValue(null);
    expect(() => sm.logSelection("test")).not.toThrow();
  });

  it("selectedPoint getter should return anchor", () => {
    sm.selectPoint(6);
    expect(sm.selectedPoint).toBe(6);
  });

  it("selectedPoints getter should return selected points", () => {
    sm.selectIndices([1, 4]);
    expect(sm.selectedPoints).toEqual([1, 4]);
  });

  it("pointer handler delegation should call through when present", () => {
    ctx._card.pointerHandler = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
    };

    const event = { type: "pointerdown" };
    sm.handlePointerDown(event);
    sm.handlePointerMove(event);
    sm.handlePointerUp(event);

    expect(ctx._card.pointerHandler.onPointerDown).toHaveBeenCalledWith(event);
    expect(ctx._card.pointerHandler.onPointerMove).toHaveBeenCalledWith(event);
    expect(ctx._card.pointerHandler.onPointerUp).toHaveBeenCalledWith(event);
  });

  it("pointer handler delegation should no-op when absent", () => {
    expect(() => sm.handlePointerDown({})).not.toThrow();
    expect(() => sm.handlePointerMove({})).not.toThrow();
    expect(() => sm.handlePointerUp({})).not.toThrow();
  });

  it("destroy should clear internal state", () => {
    sm.selectPoint(1);
    sm.destroy();
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
    expect(sm._snapshot).toBeNull();
  });
});
