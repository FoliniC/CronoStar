import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, downloadFile, handleInitializeData } from '../../../src/editor/services/service_handlers.js';

describe('service_handlers', () => {
  describe('copyToClipboard', () => {
    it('should use navigator.clipboard if available', async () => {
      const writeText = vi.fn().mockResolvedValue();
      Object.defineProperty(global.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });

      const result = await copyToClipboard('test', 'Success', 'Error');
      expect(result.success).toBe(true);
      expect(writeText).toHaveBeenCalledWith('test');
    });

    it('should use execCommand fallback if clipboard is not available', async () => {
      Object.defineProperty(global.navigator, 'clipboard', {
        value: undefined,
        configurable: true
      });
      document.execCommand = vi.fn().mockReturnValue(true);

      const result = await copyToClipboard('test', 'Success', 'Error');
      expect(result.success).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });
  });

  describe('downloadFile', () => {
    it('should create a link and click it', () => {
      global.URL.createObjectURL = vi.fn(() => 'blob:url');
      global.URL.revokeObjectURL = vi.fn();
      const link = { click: vi.fn(), href: '', download: '' };
      vi.spyOn(document, 'createElement').mockReturnValue(link);

      const result = downloadFile('test.yaml', 'content', 'Success', 'Error');
      expect(result.success).toBe(true);
      expect(link.download).toBe('test.yaml');
      expect(link.click).toHaveBeenCalled();
    });
  });

  describe('handleInitializeData', () => {
    let mockHass;
    let mockConfig;

    beforeEach(() => {
      mockHass = {
        callWS: vi.fn()
      };
      mockConfig = {
        global_prefix: 'test_',
        preset_type: 'thermostat',
        min_value: 15
      };
    });

    it('should initialize data correctly when profile exists', async () => {
      mockHass.callWS.mockResolvedValueOnce({
        response: { schedule: [{ time: '12:00', value: 20 }] }
      });

      const result = await handleInitializeData(mockHass, mockConfig, 'en');
      expect(result.success).toBe(true);
      // Verify load_profile was called
      expect(mockHass.callWS).toHaveBeenCalledWith(expect.objectContaining({
        service: 'load_profile'
      }));
      // Verify save_profile was called with corrected boundaries
      expect(mockHass.callWS).toHaveBeenCalledWith(expect.objectContaining({
        service: 'save_profile',
        service_data: expect.objectContaining({
          schedule: [
            { time: '00:00', value: 20 },
            { time: '12:00', value: 20 },
            { time: '23:59', value: 20 }
          ]
        })
      }));
    });

    it('should initialize with defaults when profile does not exist', async () => {
      mockHass.callWS.mockRejectedValueOnce(new Error('Not found'));

      const result = await handleInitializeData(mockHass, mockConfig, 'en');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Default profile initialized');
      expect(mockHass.callWS).toHaveBeenCalledWith(expect.objectContaining({
        service: 'save_profile',
        service_data: expect.objectContaining({
          schedule: [
            { time: '00:00', value: 15 },
            { time: '23:59', value: 15 }
          ]
        })
      }));
    });
  });
});
