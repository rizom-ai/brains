export type DateFormatStyle = "short" | "medium" | "long" | "full";

export interface FormatDateOptions {
  style?: DateFormatStyle;
  includeTime?: boolean;
}

/**
 * Rendered sites pin the locale and the time zone, so every template on a
 * site agrees on one date format and a static build renders the same dates
 * wherever it runs: en-US text, and the day and time a value names in UTC.
 * A date-only string such as `2026-03-14` is that day everywhere.
 */
const LOCALE = "en-US";
const TIME_ZONE = "UTC";

const STYLE_OPTIONS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  short: { year: "numeric", month: "numeric", day: "numeric" },
  medium: { year: "numeric", month: "short", day: "numeric" },
  long: { year: "numeric", month: "long", day: "numeric" },
  full: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
};

/**
 * Format a date string or Date object for display
 *
 * @param date - Date string or Date object to format
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * ```tsx
 * formatDate("2024-01-15") // "1/15/2024"
 * formatDate("2024-01-15", { style: "medium" }) // "Jan 15, 2024"
 * formatDate("2024-01-15", { style: "long" }) // "January 15, 2024"
 * formatDate(date, { style: "long", includeTime: true }) // "January 15, 2024 at 3:30 PM"
 * ```
 */
export const formatDate = (
  date: string | Date,
  options: FormatDateOptions = {},
): string => {
  const { style = "short", includeTime = false } = options;
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (includeTime) {
    return dateObj.toLocaleString(LOCALE, {
      ...STYLE_OPTIONS[style],
      hour: "numeric",
      minute: "2-digit",
      timeZone: TIME_ZONE,
    });
  }

  return dateObj.toLocaleDateString(LOCALE, {
    ...STYLE_OPTIONS[style],
    timeZone: TIME_ZONE,
  });
};
