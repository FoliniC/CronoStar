import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardSync } from '../../src/core/CardSync.js';
import { TIMEOUTS } from '../../src/config.js';

describe('CardSync', () => {
  let card;
  let sync;
  let mockHass;

  beforeEach(() => {
    card = {
      config: { target_entity: 'climate.test', step_value: 0.5 },
      stateManager: {
        getCurrentIndex: vi.fn(() => 0),
        getData: vi.fn(() => [20]),
        getPointLabel: vi.fn(() => '00:00')
      },
      isEnabled: true,
      hasUnsavedChanges: false,
      isDragging: false,
      overlaySuppressionUntil: 0,
      lastEditAt: Date.now() - 60000,
      awaitingAutomation: false,
      outOfSyncDetails: '',
      requestUpdate: vi.fn(),
      isEditorContext: vi.fn(() => false)
    };
    mockHass = {
      states: {
        'climate.test': {
          attributes: { temperature: 20 }
        }
      }
    };
    sync = new CardSync(card);
  });

  describe('computeNextHourBoundaryPlus', () => {
    it('should return timestamp for next hour boundary', () => {
      const now = new Date();
      const result = sync.computeNextHourBoundaryPlus(1000);
      const expected = new Date(now);
      expected.setHours(now.getHours() + 1, 0, 0, 0);
      expect(result).toBe(expected.getTime() + 1000);
    });
  });

  describe('scheduleAutomationOverlaySuppression', () => {
    it('should set overlaySuppressionUntil', () => {
      sync.scheduleAutomationOverlaySuppression(5000);
      expect(card.overlaySuppressionUntil).toBeGreaterThan(Date.now());
      expect(card.awaitingAutomation).toBe(false);
    });
  });

  describe('getTargetEntityAppliedValue', () => {
    it('should handle climate entities', () => {
      expect(sync.getTargetEntityAppliedValue(mockHass)).toBe(20);
      
      mockHass.states['climate.test'].attributes = { target_temperature: 22 };
      expect(sync.getTargetEntityAppliedValue(mockHass)).toBe(22);
    });

    it('should handle number entities', () => {
      card.config.target_entity = 'number.test';
      mockHass.states['number.test'] = { state: '15.5' };
      expect(sync.getTargetEntityAppliedValue(mockHass)).toBe(15.5);
    });

    it('should handle switch entities', () => {
      card.config.target_entity = 'switch.test';
      mockHass.states['switch.test'] = { state: 'on' };
      expect(sync.getTargetEntityAppliedValue(mockHass)).toBe(1);
      
      mockHass.states['switch.test'] = { state: 'off' };
      expect(sync.getTargetEntityAppliedValue(mockHass)).toBe(0);
    });
  });

  describe('updateAutomationSync', () => {
    it('should detect mismatch and set awaitingAutomation after persistence', () => {
      vi.useFakeTimers();
      
      // Mismatch
      mockHass.states['climate.test'].attributes.temperature = 18;
      
      // First call starts tracking
      sync.updateAutomationSync(mockHass);
      expect(card.awaitingAutomation).toBe(false);
      expect(card.mismatchSince).toBeGreaterThan(0);
      
      // Advance time past mismatch persistence
      vi.advanceTimersByTime(TIMEOUTS.mismatchPersistenceMs + 100);
      
      sync.updateAutomationSync(mockHass);
      expect(card.awaitingAutomation).toBe(true);
      expect(card.outOfSyncDetails).toContain('20 ≠ Entity (climate.test) 18');
      
      vi.useRealTimers();
    });

    it('should clear mismatch if values match', () => {
      card.mismatchSince = Date.now() - 10000;
      card.awaitingAutomation = true;
      
      sync.updateAutomationSync(mockHass);
      
      expect(card.awaitingAutomation).toBe(false);
      expect(card.mismatchSince).toBe(0);
    });

    it('should skip if disabled or dragging', () => {
      card.isEnabled = false;
      mockHass.states['climate.test'].attributes.temperature = 18;
      
      sync.updateAutomationSync(mockHass);
      expect(card.mismatchSince).toBeUndefined();
    });
  });
});
