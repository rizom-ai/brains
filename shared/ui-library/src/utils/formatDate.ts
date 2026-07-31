export type DateFormatStyle = "short" | "medium" | "long" | "full";

export interface FormatDateOptions {
  style?: DateFormatStyle;
  includeTime?: boolean;
}

/**
 * Rendered sites pin en-US so static builds are deterministic and every
 * template on a site agrees on one date format.
 */
const LOCALE = "en-US";

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
    });
  }

  return dateObj.toLocaleDateString(LOCALE, STYLE_OPTIONS[style]);
};
