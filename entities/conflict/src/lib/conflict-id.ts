/** The UTC second a conflict was recorded, as an id segment: no colon in it. */
export function conflictStamp(at: Date): string {
  return `${at.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/**
 * A conflict's id: its target's type and id, then its stamp. The id's
 * segments are the folders its file lives in, so every conflict over one
 * entity sits in one folder.
 */
export function conflictId(
  entityType: string,
  entityId: string,
  stamp: string,
): string {
  return `${entityType}:${entityId}:${stamp}`;
}
