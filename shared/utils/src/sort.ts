/**
 * Sorting utilities for entities
 */

/**
 * Compare two ids by UTF-16 code unit, the order the entity store lists ids
 * in (SQLite's binary collation) for every id outside the astral planes.
 * The last key of a listing's sort, so entities that tie on everything else
 * list in one order whatever order they were read in.
 */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Entity with optional metadata containing publishedAt
 */
export interface EntityWithPublishedAt {
  id: string;
  created: string;
  metadata: {
    publishedAt?: string | null | undefined;
  };
}

/**
 * Sort entities by publication date (newest first)
 * Falls back to created date if publishedAt is not set; entities published
 * at the same moment list by id.
 *
 * @example
 * const sorted = posts.sort(sortByPublicationDate);
 */
export function sortByPublicationDate<T extends EntityWithPublishedAt>(
  a: T,
  b: T,
): number {
  const aDate = a.metadata.publishedAt ?? a.created;
  const bDate = b.metadata.publishedAt ?? b.created;
  return (
    new Date(bDate).getTime() - new Date(aDate).getTime() ||
    compareIds(a.id, b.id)
  );
}
