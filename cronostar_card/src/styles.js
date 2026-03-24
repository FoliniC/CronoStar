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
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform, width, height, top, left;
    overflow: hidden;
    border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.15)) !important;
  }

  ha-card.expanded-v.expanded-h {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: 94vw !important;
    height: 94vh !important;
    z-index: 1000 !important;
    box-shadow: 0 12px 48px rgba(0,0,0,0.12) !important;
    background: var(--ha-card-background, var(--card-background-color, white)) !important;
    border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.15)) !important;
    outline: none !important;
    max-width: none !important;
    max-height: none !important;
    transition: none !important; /* Prevent jump during expansion */
    color: var(--primary-text-color);
  }

  /* Overlay backdrop when expanded */
  ha-card.expanded-v.expanded-h::before {
    content: '';
    position: fixed;
    top: -100vh;
    left: -100vw;
    right: -100vw;
    bottom: -100vh;
    background: rgba(0, 0, 0, 0.85);
    z-index: -1;
    pointer-events: all;
    backdrop-filter: blur(5px);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    background: var(--ha-card-background, var(--card-background-color, white)) !important;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-logo {
    height: 1em;
    width: auto;
    object-fit: contain;
  }

  .title {
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.5em;
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
    border-radius: 8px;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    padding: 4px 0;
    width: 200px;
  }

  .menu-content mwc-list-item {
    --mdc-list-item-vertical-padding: 4px;
    height: 36px;
    font-size: 13px;
  }

  .menu-content ha-icon,
  .context-menu ha-icon {
    margin-right: 12px;
    --mdc-icon-size: 20px;
    color: var(--secondary-text-color);
  }

  .menu-item-with-switch,
  .menu-item-with-select {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 16px;
    min-height: 36px;
    font-size: 13px;
  }

  .language-menu {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 4px;
    margin: 4px 8px;
    background: var(--card-background-color, white);
    gap: 4px;
  }

  .lang-btn {
    background: none;
    border: 1px solid var(--divider-color);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 11px;
    color: var(--primary-text-color);
    transition: all 0.2s;
  }

  .lang-btn.active {
    background: var(--primary-color, #03a9f4);
    color: white;
    border-color: var(--primary-color, #03a9f4);
    font-weight: bold;
  }

  .language-menu mwc-button {
    --mdc-button-horizontal-padding: 8px;
    min-width: 40px;
    height: 28px;
    font-size: 11px;
  }
  
  .language-menu mwc-button[raised] {
    --mdc-theme-primary: var(--primary-color, #03a9f4);
    --mdc-theme-on-primary: white;
    font-weight: bold;
  }

  ha-select {
    --mdc-select-vertical-padding: 0;
    --mdc-select-height: 32px;
    font-size: 12px;
  }

  .card-content {
    flex-grow: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
    background: var(--ha-card-background, var(--card-background-color, white)) !important;
  }

  .chart-container {
    position: relative;
    flex-grow: 1;
    min-height: 300px;
    user-select: none;
    outline: none;
    border-radius: 4px;
    overflow: hidden;
    transition: box-shadow 0.2s ease, min-height 0.3s ease;
    background: var(--ha-card-background, var(--card-background-color, transparent));
  }

  ha-card.expanded-v .chart-container {
    min-height: 450px;
    flex: 1;
  }

  .context-menu {
    position: absolute;
    background: var(--card-background-color, white);
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    padding: 4px 0;
    min-width: 150px;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .context-menu mwc-list-item {
    --mdc-list-item-vertical-padding: 4px;
    height: 36px;
    font-size: 13px;
  }

  .context-menu ha-icon {
    margin-right: 8px;
    --mdc-icon-size: 18px;
    color: var(--secondary-text-color);
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
    background: var(--ha-card-background, var(--card-background-color, #3c3c3c)) !important;
    border-radius: 8px !important;
    border: 1px solid var(--divider-color, #555) !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
    color: var(--primary-text-color, #ffffff) !important;
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: 100px !important;
    margin: 0 !important;
  }

  .preset-card .preset-icon {
    font-size: 1.8rem !important;
    margin-bottom: 2px !important;
    display: block !important;
    color: var(--primary-color) !important;
  }

  .preset-card .preset-title {
    font-weight: 600 !important;
    font-size: 0.95rem !important;
    margin: 0 !important;
    display: block !important;
  }

  .preset-card .preset-description {
    font-size: 0.75rem !important;
    color: var(--secondary-text-color, #b0b0b0) !important;
    line-height: 1.2 !important;
    display: block !important;
  }

  .preset-card:hover {
    background: var(--secondary-background-color, #4a4a4a) !important;
    border-color: var(--primary-color) !important;
  }

  .preset-card.selected {
    border: 2px solid var(--primary-color, #00b0ff) !important;
    background: var(--ha-card-background, #3c3c3c) !important;
    box-shadow: 0 0 10px var(--primary-color, rgba(0, 176, 255, 0.5)) !important;
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
    background: var(--ha-card-background, var(--card-background-color, white)) !important;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    font-size: 14px;
    color: var(--primary-text-color);
    pointer-events: none;
    opacity: 1 !important;
    visibility: visible !important;
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
    cursor: crosshair;
    touch-action: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .chart-tooltip {
    position: absolute;
    background: var(--ha-card-background, var(--card-background-color, white));
    border: 1px solid var(--primary-color, #03a9f4);
    color: var(--primary-text-color, black);
    padding: 4px 8px;
    border-radius: 4px;
    display: none;
    z-index: 9999;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
    pointer-events: none;
  }

  .hover-tooltip {
    background: var(--primary-background-color, #f5f5f5);
    border-color: var(--primary-color);
  }

  .drag-value-display {
    /* Inherits from .chart-tooltip */
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
    --mdc-theme-primary: var(--primary-color, #03a9f4);
  }

  mwc-button.outlined {
    --mdc-button-outline-color: var(--primary-color, #03a9f4);
  }

  .unsaved-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--warning-color, #ff9800);
  }

  .dialog-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    border-radius: 12px;
    backdrop-filter: blur(2px);
  }

  .dialog-content {
    background: var(--ha-card-background, var(--card-background-color, white));
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 90%;
    width: 400px;
    text-align: center;
    border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
  }

  .dialog-content h3 {
    margin: 0 0 16px 0;
    color: var(--primary-text-color);
  }

  .dialog-content p {
    margin: 0 0 24px 0;
    color: var(--primary-text-color);
    line-height: 1.4;
  }

  .dialog-buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
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
