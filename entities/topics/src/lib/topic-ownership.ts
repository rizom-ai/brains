import {
  ownTopicSources,
  topicSourceKey,
  type TopicNeighbourhood,
} from "@brains/contracts";

export {
  SOURCES_PER_TOPIC,
  ownTopicSources,
  type NearSource,
  type TopicNeighbourhood,
} from "@brains/contracts";

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
      const owner = owners.get(topicSourceKey(source));
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
