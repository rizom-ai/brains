const KEY = "studio.recent-types";
const KEPT = 8;

/** The types this browser opened, most recent first; none when unreadable. */
export function readRecentTypes(): string[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(KEY) ?? "[]",
    );
    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    // Unreadable or blocked storage: nothing is recalled.
    return [];
  }
}

/** Remember a type as opened most recently. */
export function noteRecentType(entityType: string): void {
  const next = [
    entityType,
    ...readRecentTypes().filter((type) => type !== entityType),
  ].slice(0, KEPT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the order simply stays as registered.
  }
}
