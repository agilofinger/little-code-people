/**
 * Which decorations the house wears. By default it follows the calendar: the four seasons
 * (meteorological, northern hemisphere), plus three holidays on top:
 * - Christmas: all of December.
 * - Halloween: the two weeks before October 31, and the day itself.
 * - Easter: Palm Sunday to Easter Monday (western Easter).
 * The player can also pick a theme by hand, or switch decorations off.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Holiday = 'christmas' | 'halloween' | 'easter';

export interface Theme {
  /** null: no decorations at all. */
  season: Season | null;
  holiday: Holiday | null;
}

export const THEME_CHOICES = [
  'auto',
  'christmas',
  'halloween',
  'easter',
  'spring',
  'summer',
  'autumn',
  'winter',
  'off',
] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const HOLIDAY_SEASON: Record<Holiday, Season> = {
  christmas: 'winter',
  halloween: 'autumn',
  easter: 'spring',
};

const DAY = 86_400_000;

/** Easter Sunday in the Gregorian calendar (Meeus/Jones/Butcher algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Whole days from a to b, by calendar date (immune to daylight saving shifts). */
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY);
}

export function holidayOn(date: Date): Holiday | null {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 11) return 'christmas';
  if (month === 9 && day >= 17) return 'halloween';
  const fromEaster = daysBetween(easterSunday(date.getFullYear()), date);
  if (fromEaster >= -7 && fromEaster <= 1) return 'easter';
  return null;
}

export function seasonOn(date: Date): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function themeFor(date: Date, choice: ThemeChoice): Theme {
  switch (choice) {
    case 'off':
      return { season: null, holiday: null };
    case 'auto': {
      const holiday = holidayOn(date);
      return { season: holiday ? HOLIDAY_SEASON[holiday] : seasonOn(date), holiday };
    }
    case 'christmas':
    case 'halloween':
    case 'easter':
      return { season: HOLIDAY_SEASON[choice], holiday: choice };
    default:
      return { season: choice, holiday: null };
  }
}

export function themeKey(t: Theme): string {
  return `${t.season ?? 'none'}|${t.holiday ?? 'none'}`;
}
