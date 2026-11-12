/**
 * Which topic each source belongs to, shared by topics, which judges a
 * topic by the sources it owns, and the knowledge map, which draws a
 * topic's owned sources inside its territory.
 */

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

/** The key a source is owned under: its type and id. */
export const topicSourceKey = ({
  entityType,
  entityId,
}: Pick<NearSource, "entityType" | "entityId">): string =>
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
      const key = topicSourceKey(source);
      const current = closest.get(key);
      if (!current || source.distance < current.distance)
        closest.set(key, { topicId, distance: source.distance });
    }
  }
  return new Map([...closest].map(([key, { topicId }]) => [key, topicId]));
}
