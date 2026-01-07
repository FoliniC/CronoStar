import { describe, it, expect, vi } from 'vitest';
import { log } from '../../src/utils/logger_utils.js';

describe('logger_utils', () => {
  it('should log when enabled', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log('info', true, 'test message');
    expect(spy).toHaveBeenCalledWith('[CronoStar]', 'test message');
    spy.mockRestore();
  });

  it('should not log when disabled', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log('info', false, 'test message');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should use correct level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log('error', true, 'error message');
    expect(spy).toHaveBeenCalledWith('[CronoStar]', 'error message');
    spy.mockRestore();
  });

  it('should fallback to log for unknown levels', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('unknown', true, 'message');
    expect(spy).toHaveBeenCalledWith('[CronoStar]', 'message');
    spy.mockRestore();
  });
});
