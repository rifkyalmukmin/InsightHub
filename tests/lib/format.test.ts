import {
  formatRelativeTime,
  formatDateTime,
  formatDate,
  formatNumber,
  truncate,
  getDomain,
  readingTime,
} from '@/lib/utils/format';

describe('format utilities', () => {
  describe('formatRelativeTime', () => {
    it('returns relative time with default locale', () => {
      const result = formatRelativeTime(new Date());
      expect(result).toContain('ago');
    });

    it('falls back to enUS for unknown locale', () => {
      const result = formatRelativeTime(new Date(), 'xx');
      expect(result).toContain('ago');
    });
  });

  describe('formatDateTime', () => {
    it('formats a date string', () => {
      const result = formatDateTime('2026-01-15T10:30:00Z');
      expect(result).toBeTruthy();
    });

    it('uses non-default locale', () => {
      const result = formatDateTime('2026-01-15T10:30:00Z', 'de');
      expect(result).toBeTruthy();
    });
  });

  describe('formatDate', () => {
    it('formats a date', () => {
      const result = formatDate('2026-06-15');
      expect(result).toContain('Jun');
      expect(result).toContain('2026');
    });

    it('uses locale', () => {
      const result = formatDate('2026-06-15', 'fr');
      expect(result).toBeTruthy();
    });
  });

  describe('formatNumber', () => {
    it('formats millions', () => {
      expect(formatNumber(2_500_000)).toBe('2.5M');
    });

    it('formats thousands', () => {
      expect(formatNumber(1_500)).toBe('1.5K');
    });

    it('formats small numbers', () => {
      const result = formatNumber(42);
      expect(result).toBe('42');
    });
  });

  describe('truncate', () => {
    it('does not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('truncates long strings with ellipsis', () => {
      const result = truncate('hello world this is long', 11);
      expect(result).toHaveLength(12); // 11 trimmed + ellipsis
      expect(result).toContain('…');
    });
  });

  describe('getDomain', () => {
    it('extracts domain without www', () => {
      expect(getDomain('https://www.example.com/path')).toBe('example.com');
    });

    it('returns input for invalid URL', () => {
      expect(getDomain('not-a-url')).toBe('not-a-url');
    });
  });

  describe('readingTime', () => {
    it('calculates reading time', () => {
      expect(readingTime(400)).toBe(2);
      expect(readingTime(199)).toBe(1);
    });
  });
});
