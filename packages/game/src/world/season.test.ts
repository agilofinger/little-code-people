import { describe, expect, it } from 'vitest';
import { easterSunday, holidayOn, seasonOn, themeFor } from './season.ts';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'], // latest possible
    [2285, '2285-03-22'], // earliest possible
  ])('%i → %s', (year, expected) => expect(iso(easterSunday(year))).toBe(expected));
});

describe('holidays', () => {
  it('Christmas is all of December', () => {
    expect(holidayOn(d(2026, 11, 30))).toBeNull();
    expect(holidayOn(d(2026, 12, 1))).toBe('christmas');
    expect(holidayOn(d(2026, 12, 31))).toBe('christmas');
  });

  it('Halloween is the two weeks before October 31 and the day itself', () => {
    expect(holidayOn(d(2026, 10, 16))).toBeNull();
    expect(holidayOn(d(2026, 10, 17))).toBe('halloween');
    expect(holidayOn(d(2026, 10, 31))).toBe('halloween');
    expect(holidayOn(d(2026, 11, 1))).toBeNull();
  });

  it('Easter runs from Palm Sunday to Easter Monday', () => {
    // Easter 2026 is April 5
    expect(holidayOn(d(2026, 3, 28))).toBeNull();
    expect(holidayOn(d(2026, 3, 29))).toBe('easter');
    expect(holidayOn(d(2026, 4, 6))).toBe('easter');
    expect(holidayOn(d(2026, 4, 7))).toBeNull();
  });
});

describe('themeFor', () => {
  it('follows the calendar on auto, with holidays on top of their season', () => {
    expect(seasonOn(d(2026, 1, 15))).toBe('winter');
    expect(themeFor(d(2026, 5, 10), 'auto')).toEqual({ season: 'spring', holiday: null });
    expect(themeFor(d(2026, 7, 10), 'auto')).toEqual({ season: 'summer', holiday: null });
    expect(themeFor(d(2026, 10, 1), 'auto')).toEqual({ season: 'autumn', holiday: null });
    expect(themeFor(d(2026, 10, 23), 'auto')).toEqual({ season: 'autumn', holiday: 'halloween' });
    expect(themeFor(d(2026, 12, 24), 'auto')).toEqual({ season: 'winter', holiday: 'christmas' });
  });

  it('lets the player pick a theme or switch decorations off', () => {
    expect(themeFor(d(2026, 7, 10), 'christmas')).toEqual({ season: 'winter', holiday: 'christmas' });
    expect(themeFor(d(2026, 12, 24), 'summer')).toEqual({ season: 'summer', holiday: null });
    expect(themeFor(d(2026, 12, 24), 'off')).toEqual({ season: null, holiday: null });
  });
});
