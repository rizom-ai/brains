/**
 * How many of a topic's nearest sources stand for it: its members on the
 * knowledge map, and the evidence that it covers ground of its own.
 */
export const SOURCES_PER_TOPIC = 8;

/** A source found near a topic, at its cosine distance from the topic. */
export interface NearSource {
  entityType: string;
  entityId: string;
  distance: number;
}

/** A topic and its nearest sources, closest first. */
export interface TopicNeighbourhood {
  topicId: string;
  sources: NearSource[];
}

const sourceKey = ({ entityType, entityId }: NearSource): string =>
  `${entityType}:${entityId}`;

/**
 * The topic each source belongs to, keyed by type and id: the one it sits
 * closest to, the earlier topic on a tie.
 */
export function ownTopicSources(
  neighbourhoods: TopicNeighbourhood[],
): Map<string, string> {
  const closest = new Map<string, { topicId: string; distance: number }>();
  for (const { topicId, sources } of neighbourhoods) {
    for (const source of sources) {
      const key = sourceKey(source);
      const current = closest.get(key);
      if (!current || source.distance < current.distance)
        closest.set(key, { topicId, distance: source.distance });
    }
  }
  return new Map([...closest].map(([key, { topicId }]) => [key, topicId]));
}

/**
 * Topics that duplicate another: they own none of their nearest sources, and
 * one other topic owns at least half of them. Each joins that topic; on a
 * tie, the one owning its closest source. A broad topic whose sources are
 * spread over several topics stays.
 */
export function duplicateTopics(
  neighbourhoods: TopicNeighbourhood[],
): { topicId: string; into: string }[] {
  const owners = ownTopicSources(neighbourhoods);
  return neighbourhoods.flatMap(({ topicId, sources }) => {
    const ownedBy = sources.flatMap((source) => {
      const owner = owners.get(sourceKey(source));
      return owner ? [{ owner, distance: source.distance }] : [];
    });
    if (ownedBy.length === 0 || ownedBy.some(({ owner }) => owner === topicId))
      return [];
    const claims = new Map<string, { count: number; closest: number }>();
    for (const { owner, distance } of ownedBy) {
      const claim = claims.get(owner) ?? { count: 0, closest: distance };
      claims.set(owner, {
        count: claim.count + 1,
        closest: Math.min(claim.closest, distance),
      });
    }
    const [into] = [...claims].sort(
      ([, left], [, right]) =>
        right.count - left.count || left.closest - right.closest,
    );
    return into && into[1].count * 2 >= sources.length
      ? [{ topicId, into: into[0] }]
      : [];
  });
}
