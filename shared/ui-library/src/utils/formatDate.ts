export type DateFormatStyle = "short" | "long" | "full";

export interface FormatDateOptions {
  style?: DateFormatStyle;
  includeTime?: boolean;
}

/**
 * Format a date string or Date object for display
 *
 * @param date - Date string or Date object to format
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * ```tsx
 * // Short format (default)
 * formatDate("2024-01-15") // "1/15/2024" (locale-dependent)
 *
 * // Long format
 * formatDate("2024-01-15", { style: "long" }) // "January 15, 2024"
 *
 * // With time
 * formatDate(new Date(), { includeTime: true }) // "1/15/2024, 3:30:45 PM"
 * ```
 */
export const formatDate = (
  date: string | Date,
  options: FormatDateOptions = {},
): string => {
  const { style = "short", includeTime = false } = options;
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (includeTime) {
    return dateObj.toLocaleString();
  }

  switch (style) {
    case "long":
      return dateObj.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "full":
      return dateObj.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "short":
    default:
      return dateObj.toLocaleDateString();
  }
};
