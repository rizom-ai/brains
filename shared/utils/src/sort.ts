/**
 * Sorting utilities for entities
 */

/**
 * Entity with optional metadata containing publishedAt
 */
interface EntityWithPublishedAt {
  created: string;
  metadata: {
    publishedAt?: string | null | undefined;
  };
}

/**
 * Sort entities by publication date (newest first)
 * Falls back to created date if publishedAt is not set
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
  return new Date(bDate).getTime() - new Date(aDate).getTime();
}
