import { describe, it, expect } from 'vitest';
import { slugify, pad2, getHoursList, escapeHtml } from '../../src/utils/editor_utils.js';

describe('editor_utils', () => {
  describe('slugify', () => {
    it('should slugify strings', () => {
      expect(slugify('Hello World')).toBe('hello_world');
      expect(slugify('Test! @#$% Name')).toBe('test_name');
      expect(slugify('  Trim Me  ')).toBe('trim_me');
      expect(slugify(null)).toBe('');
    });
  });

  describe('pad2', () => {
    it('should pad single digits', () => {
      expect(pad2(5)).toBe('05');
      expect(pad2(12)).toBe('12');
    });
  });

  describe('getHoursList', () => {
    it('should return 0-based list by default', () => {
      const list = getHoursList(0);
      expect(list).toHaveLength(24);
      expect(list[0]).toBe('00');
      expect(list[23]).toBe('23');
    });

    it('should return 1-based list if requested for 60m interval', () => {
      const list = getHoursList(1, 60);
      expect(list).toHaveLength(24);
      expect(list[0]).toBe('01');
      expect(list[23]).toBe('24');
    });

    it('should handle different intervals', () => {
      const list = getHoursList(0, 30);
      expect(list).toHaveLength(48);
      expect(list[0]).toBe('00');
      expect(list[47]).toBe('47');
    });
  });

  describe('escapeHtml', () => {
    it('should escape special characters', () => {
      expect(escapeHtml('<b>"hello"</b> & <test>')).toBe('&lt;b&gt;"hello"&lt;/b&gt; &amp; &lt;test&gt;');
    });

    it('should handle non-string input', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(null)).toBe('null');
    });
  });
});
