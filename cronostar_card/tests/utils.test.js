import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  waitWithTimeout, 
  debounce, 
  roundTo, 
  clamp, 
  formatHourString, 
  safeParseFloat, 
  deepClone, 
  unique, 
  isDefined, 
  slugify, 
  timeToMinutes, 
  minutesToTime,
  checkIsEditorContext,
  Logger
} from '../src/utils.js';

describe('utils', () => {
  describe('waitWithTimeout', () => {
    it('should resolve if promise resolves before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await waitWithTimeout(promise, 100);
      expect(result).toBe('success');
    });

    it('should reject if timeout reached', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('too late'), 200));
      await expect(waitWithTimeout(promise, 50)).rejects.toThrow('Timeout');
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', () => {
      vi.useFakeTimers();
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced('a');
      debounced('b');
      debounced('c');

      expect(func).not.toBeCalled();

      vi.advanceTimersByTime(100);
      expect(func).toBeCalledTimes(1);
      expect(func).toBeCalledWith('c');
      vi.useRealTimers();
    });
  });

  describe('roundTo', () => {
    it('should round to specified decimals', () => {
      expect(roundTo(1.234, 1)).toBe(1.2);
      expect(roundTo(1.234, 2)).toBe(1.23);
      expect(roundTo(1.25, 1)).toBe(1.3);
    });
  });

  describe('clamp', () => {
    it('should clamp value between min and max', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('formatHourString', () => {
    it('should format hour with padding', () => {
      expect(formatHourString(5)).toBe('05');
      expect(formatHourString(12)).toBe('12');
      expect(formatHourString(5, 1)).toBe('06');
    });
  });

  describe('safeParseFloat', () => {
    it('should parse valid floats', () => {
      expect(safeParseFloat('1.5')).toBe(1.5);
      expect(safeParseFloat(2.7)).toBe(2.7);
    });

    it('should return default value for invalid input', () => {
      expect(safeParseFloat('abc', 0)).toBe(0);
      expect(safeParseFloat(undefined, 5)).toBe(5);
    });
  });

  describe('deepClone', () => {
    it('should deep clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.b).not.toBe(obj.b);
    });
  });

  describe('unique', () => {
    it('should return unique elements', () => {
      expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('slugify', () => {
    it('should slugify strings', () => {
      expect(slugify('Hello World')).toBe('hello_world');
      expect(slugify('Test! @#$% Name')).toBe('test_name');
      expect(slugify('  Trim Me  ')).toBe('trim_me');
      expect(slugify(null)).toBe('');
    });
  });

  describe('timeToMinutes', () => {
    it('should convert time string to minutes', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('01:30')).toBe(90);
      expect(timeToMinutes('23:59')).toBe(1439);
      expect(timeToMinutes(null)).toBe(0);
    });
  });

  describe('minutesToTime', () => {
    it('should convert minutes to time string', () => {
      expect(minutesToTime(0)).toBe('00:00');
      expect(minutesToTime(90)).toBe('01:30');
      expect(minutesToTime(1439)).toBe('23:59');
    });

    it('should handle overflow and underflow', () => {
      expect(minutesToTime(1440)).toBe('00:00');
      expect(minutesToTime(-60)).toBe('23:00');
    });
  });

  describe('checkIsEditorContext', () => {
    it('should return true if inside editor tags', () => {
      const el = {
        tagName: 'HUI-CARD-EDITOR',
        parentElement: null
      };
      expect(checkIsEditorContext(el)).toBe(true);
    });

    it('should return false if not inside editor tags', () => {
      const el = {
        tagName: 'DIV',
        parentElement: {
          tagName: 'SPAN',
          parentElement: null
        }
      };
      expect(checkIsEditorContext(el)).toBe(false);
    });

    it('should handle null/error cases', () => {
      expect(checkIsEditorContext(null)).toBe(false);
    });
  });

  describe('Logger', () => {
    let consoleSpy;
    
    beforeEach(() => {
      Logger.setEnabled(false);
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should not log when disabled', () => {
      Logger.log('TEST', 'message');
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[CRONOSTAR] [TEST]'), 'message');
    });

    it('should log when enabled', () => {
      Logger.setEnabled(true);
      Logger.log('TEST', 'message');
      expect(consoleSpy).toHaveBeenCalledWith('[CRONOSTAR] [TEST]', 'message');
    });

    it('should always log errors', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Logger.error('TEST', 'boom');
      expect(errorSpy).toHaveBeenCalledWith('[CRONOSTAR] [TEST]', 'boom');
      errorSpy.mockRestore();
    });
  });
});
