const dayMs = 24 * 60 * 60 * 1000;

export const sessionTitleMaxLength = 48;

export function deriveSessionTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine) return "New conversation";
  if (firstLine.length <= sessionTitleMaxLength) return firstLine;
  return `${firstLine.slice(0, sessionTitleMaxLength - 1).trimEnd()}…`;
}

/** Coarser the further back it goes: clock time today, weekday this week, date beyond. */
export function formatSessionTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "—";
  const diff = now.getTime() - then.getTime();
  if (diff < dayMs && then.getDate() === now.getDate()) {
    return then.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now.getTime() - dayMs);
  if (then.getDate() === yesterday.getDate()) return "Yest";
  if (diff < 7 * dayMs) {
    return then.toLocaleDateString(undefined, { weekday: "short" });
  }
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
