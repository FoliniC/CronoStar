/**
 * Styles for CronoStar Card
 * @module styles
 */
import { css } from 'lit';
export const cardStyles = css`
  ha-card {
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
  }

  .name {
    font-size: 1.2rem;
    font-weight: 500;
  }

  .menu-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .menu-button svg {
    fill: var(--primary-text-color);
  }

  .language-menu mwc-button {
    margin: 0 4px;
  }

  /* Fallback highlight if raised/unelevated are not visually obvious */
  .language-menu mwc-button:disabled {
    opacity: 0.6;
  }

  .menu-content {
    position: absolute;
    top: 48px;
    right: 8px;
    background: var(--card-background-color, white);
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 4px;
    z-index: 100;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    padding: 8px 0;
  }

  .menu-item-with-switch,
  .menu-item-with-select {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    min-height: 48px;
  }

  .menu-item-with-switch span,
  .menu-item-with-select span {
    flex-grow: 1;
    color: var(--primary-text-color);
  }

  .language-menu {
    display: flex;
    align-items: center;
    padding: 0 8px;
  }

  .card-content {
    flex-grow: 1;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .chart-container {
    position: relative;
    flex-grow: 1;
    min-height: 300px;
    user-select: none;
    outline: none;
    border-radius: 4px;
    transition: box-shadow 0.2s ease;
  }

  /* Visual focus indicator for keyboard navigation */
  .chart-container:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-color, #03a9f4);
  }

  .chart-container:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-color, #03a9f4);
  }

  /* Preset card grid and 3D outlined style for editor presets */
  .preset-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-top: 8px;
  }

  .preset-card {
    -webkit-appearance: none;
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: 12px;
    gap: 6px;
    background: linear-gradient(180deg, var(--card-background-color, #fff), color-mix(in srgb, var(--card-background-color, #fff) 92%, black 8%));
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--divider-color, #e0e0e0) 80%, transparent 20%);
    box-shadow: 0 6px 16px rgba(16,24,40,0.08), 0 2px 6px rgba(16,24,40,0.06);
    transform: perspective(800px) translateZ(0);
    transition: transform 220ms cubic-bezier(.2,.9,.2,1), box-shadow 220ms ease, border-color 180ms ease;
    cursor: pointer;
    color: var(--primary-text-color);
    min-height: 88px;
    overflow: hidden;
  }

  .preset-card .preset-icon {
    font-size: 1.6rem;
    opacity: 0.95;
  }

  .preset-card .preset-title {
    font-weight: 600;
    font-size: 0.98rem;
  }

  .preset-card .preset-description {
    font-size: 0.86rem;
    color: color-mix(in srgb, var(--primary-text-color) 72%, black 28%);
  }

  .preset-card:hover {
    transform: translateY(-6px) rotateX(3deg) scale(1.01);
    box-shadow: 0 14px 34px rgba(16,24,40,0.14), 0 6px 12px rgba(16,24,40,0.08);
    border-color: color-mix(in srgb, var(--primary-color, #03a9f4) 28%, var(--divider-color, #e0e0e0) 72%);
  }

  .preset-card:active {
    transform: translateY(-2px) rotateX(1deg) scale(0.998);
  }

  .preset-card.selected {
    box-shadow: 0 18px 44px rgba(3,169,244,0.12), 0 8px 18px rgba(3,169,244,0.06);
    border-color: var(--primary-color, #03a9f4);
    outline: 2px solid color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent 86%);
  }

  .preset-card:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color, #03a9f4) 18%, transparent 82%);
    outline-offset: 2px;
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
    font-size: 14px;
    color: var(--primary-text-color);
    pointer-events: none;
  }

  .startup-overlay {
    backdrop-filter: blur(1px);
    color: var(--error-color, red);
  }

  .selection-rect {
    position: absolute;
    border: 2px dashed var(--primary-color, #03a9f4);
    background: rgba(3, 169, 244, 0.15);
    display: none;
    pointer-events: none;
    z-index: 20;
    border-radius: 4px;
  }

  .anomalous-operation-overlay {
    background: transparent;
    color: var(--primary-text-color);
    font-weight: bold;
    text-align: center;
    padding: 20px;
    pointer-events: none;
  }

  .loading-overlay.awaiting-automation-overlay {
    background: transparent;
    color: var(--warning-color, #ff9800);
    font-weight: bold;
    text-align: center;
    padding: 20px;
  }

  .anomalous-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 2em;
    color: rgba(128, 128, 128, 0.1);
    pointer-events: none;
    user-select: none;
    z-index: 1;
    white-space: nowrap;
    text-shadow: none;
  }

  .startup-watermark {
    position: absolute;
    top: 55%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 1.8em;
    color: rgba(0, 128, 255, 0.10);
    pointer-events: none;
    user-select: none;
    z-index: 1;
    white-space: nowrap;
    text-shadow: none;
    font-weight: 700;
    letter-spacing: 1px;
  }

  canvas {
    cursor: ns-resize;
    touch-action: none;
  }

  .drag-value-display {
    position: absolute;
    top: 0;
    left: 0;
    background: var(--card-background-color, white);
    border: 1px solid var(--divider-color, #e0e0e0);
    padding: 4px 8px;
    border-radius: 4px;
    display: none;
    z-index: 100;
    font-size: 12px;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    white-space: nowrap;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--divider-color, #e0e0e0);
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-group span {
    font-size: 14px;
    color: var(--primary-text-color);
  }

  ha-select {
    min-width: 180px;
  }

  mwc-button {
    --mdc-theme-primary: var(--primary-color);
  }

  mwc-button.outlined {
    --mdc-button-outline-color: var(--primary-color);
  }

  .unsaved-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--warning-color, #ff9800);
  }

  @media (max-width: 600px) {
    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .control-group {
      width: 100%;
      justify-content: space-between;
    }

    ha-select {
      width: 100%;
    }
  }
`;  