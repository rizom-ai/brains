/**
 * Date utilities for API calls and data processing
 */

/**
 * Format a Date as YYYY-MM-DD string (ISO date without time)
 *
 * @example
 * toISODateString(new Date("2025-01-15T10:30:00Z")) // "2025-01-15"
 */
export function toISODateString(date: Date): string {
  const isoString = date.toISOString();
  return isoString.substring(0, isoString.indexOf("T"));
}

/**
 * Get yesterday's date
 *
 * @example
 * getYesterday() // Date object for yesterday
 */
export function getYesterday(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date;
}

/**
 * Get a date N days ago
 *
 * @example
 * getDaysAgo(7) // Date object for 7 days ago
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}
