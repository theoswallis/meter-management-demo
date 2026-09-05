import { describe, it, expect } from 'vitest';
import {
  getUtilityUnit,
  formatNumber,
  formatDateTime,
  formatDateOnly,
} from '../formatters.js';

describe('formatters', () => {
  describe('getUtilityUnit', () => {
    it('returns correct units for utility types', () => {
      expect(getUtilityUnit('electric')).toBe('kWh');
      expect(getUtilityUnit('water')).toBe('gal');
      expect(getUtilityUnit('gas')).toBe('therms');
      expect(getUtilityUnit(undefined)).toBe('units');
    });
  });

  describe('formatNumber', () => {
    it('formats numeric values with separators and decimal limits', () => {
      expect(formatNumber(12500.5)).toBe('12,500.5');
      expect(formatNumber('12500.555', 2)).toBe('12,500.56');
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
      expect(formatNumber('invalid')).toBe('0');
    });
  });

  describe('formatDateTime', () => {
    it('formats valid date strings and handles nulls gracefully', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatDateTime('invalid-date')).toBe('—');
      const formatted = formatDateTime('2026-09-04T12:00:00.000Z');
      expect(formatted).not.toBe('—');
      expect(formatted).toContain('2026');
    });
  });

  describe('formatDateOnly', () => {
    it('formats date only and handles nulls gracefully', () => {
      expect(formatDateOnly(null)).toBe('—');
      expect(formatDateOnly(undefined)).toBe('—');
      const formatted = formatDateOnly('2026-09-04T12:00:00.000Z');
      expect(formatted).not.toBe('—');
      expect(formatted).toContain('2026');
    });
  });
});
