const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-10-09` as `9 Oct`, the same in every locale. */
export function shortDate(date: string): string {
  const [, month, dayOfMonth] = date.split("-");
  return `${Number(dayOfMonth)} ${MONTHS[Number(month) - 1] ?? month}`;
}
