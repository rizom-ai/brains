const DAY_MS = 86_400_000;

/** A UTC midnight for a `YYYY-MM-DD` date. */
function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** An ISO-8601 week: id `YYYY-Www`, Monday `start`, Sunday `end`. */
export interface IsoWeek {
  id: string;
  start: string;
  end: string;
}

/**
 * The ISO week holding a date. Weeks run Monday to Sunday, and week 1 is the
 * one holding the year's first Thursday, so early January can belong to the
 * previous year's last week.
 */
export function isoWeekOf(date: string): IsoWeek {
  const day = utcDate(date);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const monday = new Date(day.getTime() - weekday * DAY_MS);
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = utcDate(`${year}-01-04`);
  const firstMonday = new Date(
    firstThursday.getTime() - ((firstThursday.getUTCDay() + 6) % 7) * DAY_MS,
  );
  const week =
    Math.round((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
  return {
    id: `${year}-W${String(week).padStart(2, "0")}`,
    start: toDateString(monday),
    end: toDateString(new Date(monday.getTime() + 6 * DAY_MS)),
  };
}

/** Every `YYYY-MM-DD` date from `start` to `end`, inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const from = utcDate(start).getTime();
  const days = Math.round((utcDate(end).getTime() - from) / DAY_MS) + 1;
  return Array.from({ length: Math.max(days, 0) }, (_, i) =>
    toDateString(new Date(from + i * DAY_MS)),
  );
}

/** The date `days` after (or, negative, before) a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  return toDateString(new Date(utcDate(date).getTime() + days * DAY_MS));
}
