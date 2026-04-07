// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function createTestDocument() {
  const createElement = (tagName) => {
    const element = {
      tagName: String(tagName || "").toUpperCase(),
      style: {},
      children: [],
      parentElement: null,
      isConnected: true,
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 300,
        height: 150,
      })),
    };
    return element;
  };

  return {
    createElement,
    head: { innerHTML: "" },
  };
}

if