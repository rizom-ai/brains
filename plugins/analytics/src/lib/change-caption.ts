/** A total's change on the period before, as the caption under the total. */
export function changeCaption(change: number | null): string {
  if (change === null) return "nothing to compare with";
  return `${change > 0 ? "+" : ""}${change}% on the period before`;
}
