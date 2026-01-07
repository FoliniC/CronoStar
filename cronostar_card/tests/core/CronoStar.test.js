import { vi, describe, beforeEach, it, expect } from 'vitest';
import { fixture, html, waitUntil } from '@open-wc/testing';
import sinon from 'sinon';

// Mock ResizeObserver
global.ResizeObserver = class {
  constructor(callback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Canvas.getContext
const mockContext = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  resetTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
  setLineDash: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createPattern: () => ({}),
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function(type) {
    if (type === '2d') {
      mockContext.canvas = this;
      return mockContext;
    }
    return null;
  }
});

import { CronoStarCard } from '../../src/core/CronoStar.js';
import { Chart } from 'chart.js';

// Prevent "Canvas is already in use" errors
vi.spyOn(Chart, 'getChart').mockReturnValue(null);

if (!customElements.get('cronostar-card')) {
  customElements.define('cronostar-card', CronoStarCard);
}

describe('CronoStar Card', () => {
  let element;
  const mockHass = {
    states: {
      'climate.test': {
        state: '20.0',
        attributes: { friendly_name: 'Test Climate' },
      },
    },
    language: 'en',
    callService: sinon.stub(),
  };

  const mockConfig = {
    type: 'custom:cronostar-card',
    preset: 'thermostat',
    target_entity: 'climate.test',
    global_prefix: 'test_prefix_',
  };

  beforeEach(async () => {
    element = await fixture(html`<cronostar-card></cronostar-card>`);
    element.hass = mockHass;
    element.setConfig(mockConfig);
    await element.updateComplete;
  });

  it('is defined', () => {
    const el = document.createElement('cronostar-card');
    expect(el).to.be.instanceOf(customElements.get('cronostar-card'));
  });

  it('renders the card header', async () => {
    const header = element.shadowRoot.querySelector('.card-header');
    expect(header).to.exist;
  });

  it('shows error if config is missing target_entity', async () => {
    try {
      element.setConfig({ type: 'custom:cronostar-card' });
    } catch (err) {
      expect(err.message).to.contain('You need to define a target_entity');
    }
  });

  it('updates when hass changes', async () => {
    const newHass = { ...mockHass, language: 'it' };
    element.hass = newHass;
    await element.updateComplete;
    // Verify something that changes with language if applicable
    expect(element.hass.language).to.equal('it');
  });
});
