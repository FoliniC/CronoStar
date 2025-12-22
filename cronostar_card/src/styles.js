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
    padding: 8px 16px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 4px;
    margin: 8px 16px;
    background: var(--card-background-color, white);
  }

  .language-menu mwc-button {
    margin: 0 4px;
  }
  
  .language-menu mwc-button[raised] {
    --mdc-theme-primary: var(--primary-color, #03a9f4);
    --mdc-theme-on-primary: white;
    font-weight: bold;
    border: 2px solid var(--primary-color, #03a9f4);
  }

  .card-content {
    flex-grow: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
  }

  .chart-container {
    position: relative;
    flex-grow: 1;
    min-height: 300px;
    user-select: none;
    outline: none;
    border-radius: 4px;
    overflow: hidden;
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
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 12px !important;
    margin-top: 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .preset-card {
    -webkit-appearance: none;
    appearance: none;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    text-align: center !important;
    padding: 12px !important;
    gap: 4px !important;
    background: #3c3c3c !important;
    border-radius: 8px !important;
    border: 1px solid #555 !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
    color: #ffffff !important;
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: 100px !important;
    margin: 0 !important;
  }

  .preset-card .preset-icon {
    font-size: 1.8rem !important;
    margin-bottom: 2px !important;
    display: block !important;
  }

  .preset-card .preset-title {
    font-weight: 600 !important;
    font-size: 0.95rem !important;
    margin: 0 !important;
    display: block !important;
  }

  .preset-card .preset-description {
    font-size: 0.75rem !important;
    color: #b0b0b0 !important;
    line-height: 1.2 !important;
    display: block !important;
  }

  .preset-card:hover {
    background: #4a4a4a !important;
    border-color: #777 !important;
  }

  .preset-card.selected {
    border: 2px solid #00b0ff !important;
    background: #3c3c3c !important;
    box-shadow: 0 0 10px rgba(0, 176, 255, 0.5) !important;
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
    display: block;
    cursor: ns-resize;
    touch-action: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
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
    flex-shrink: 0;
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