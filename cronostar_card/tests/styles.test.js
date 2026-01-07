import { describe, it, expect } from 'vitest';
import { cardStyles } from '../src/styles.js';

describe('styles.js', () => {
  it('should export cardStyles as a Lit CSSResult-like object', () => {
    expect(cardStyles).not.toBeUndefined();
    expect(cardStyles).not.toBeNull();
    expect(typeof cardStyles.cssText).toBe('string');
    expect(cardStyles.cssText.length).toBeGreaterThan(0);
  });

  it('should contain key CSS rules', () => {
    const styleString = cardStyles.cssText; // Get the raw CSS text

    // Check for some critical selectors and properties
    expect(styleString).toContain('ha-card {');
    expect(styleString).toContain('padding: 16px;');
    expect(styleString).toContain('flex-direction: column;');
    expect(styleString).toContain('.card-header {');
    expect(styleString).toContain('display: flex;');
    expect(styleString).toContain('.chart-container {');
    expect(styleString).toContain('position: relative;');
    expect(styleString).toContain('min-height: 300px;');
    expect(styleString).toContain('.context-menu {');
    expect(styleString).toContain('background: var(--card-background-color, white);');
    expect(styleString).toContain('z-index: 1000;');
    expect(styleString).toContain('canvas {');
    expect(styleString).toContain('display: block;');
    expect(styleString).toContain('cursor: crosshair;');
  });

  it('should apply expansion styles correctly', () => {
    const styleString = cardStyles.cssText;
    expect(styleString).toContain('ha-card.expanded-v.expanded-h {');
    expect(styleString).toContain('position: fixed !important;');
    expect(styleString).toContain('transform: translate(-50%, -50%) !important;');
    expect(styleString).toContain('width: 94vw !important;');
  });

  it('should include preset card styles', () => {
    const styleString = cardStyles.cssText;
    expect(styleString).toContain('.preset-cards {');
    expect(styleString).toContain('display: grid !important;');
    expect(styleString).toContain('.preset-card {');
    expect(styleString).toContain('background: #3c3c3c !important;');
    expect(styleString).toContain('.preset-card.selected {');
    expect(styleString).toContain('border: 2px solid #00b0ff !important;');
  });

  it('should include loading and overlay styles', () => {
    const styleString = cardStyles.cssText;
    expect(styleString).toContain('.loading-overlay {');
    expect(styleString).toContain('position: absolute;');
    expect(styleString).toContain('background: rgba(255, 255, 255, 0.8);');
    expect(styleString).toContain('.anomalous-operation-overlay {');
    expect(styleString).toContain('pointer-events: none;');
  });
});
