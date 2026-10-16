import { formatShortDate } from "@brains/action-items";
import type { SummaryTimeRange } from "../../schemas/summary";

export function formatTimeRange(range: SummaryTimeRange): string {
  const start = new Date(range.start);
  const end = new Date(range.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return formatShortDate(range.start);
  }
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  if (sameDay) return formatShortDate(range.start);
  return `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`;
}
