import type { TopicsPluginConfig } from "../schemas/config";
import type { TopicProposal, TopicVote } from "../schemas/votes";

export interface TopicTally {
  slug: string;
  title: string;
  support: number;
  canEnter: boolean;
  proposals: TopicProposal[];
}

export interface ActiveTopic {
  id: string;
  slug: string;
  title: string;
}

export function topicSoftCeiling(
  sourceCount: number,
  sourceRatio: number,
): number {
  return Math.min(24, Math.max(5, Math.ceil(sourceCount / sourceRatio)));
}

export function tallyTopicVotes(
  sources: readonly { vote: TopicVote; weight: number; canMint: boolean }[],
  config: TopicsPluginConfig,
): Map<string, TopicTally> {
  const tally = new Map<string, TopicTally>();
  for (const { vote, weight, canMint } of sources) {
    const perSource = new Map(
      vote.supported.map((supported) => [supported.slug, supported]),
    );
    if (vote.proposal) {
      const current = perSource.get(vote.proposal.slug);
      if (!current || current.relevanceScore < vote.proposal.relevanceScore) {
        perSource.set(vote.proposal.slug, vote.proposal);
      }
    }
    for (const supported of perSource.values()) {
      if (supported.relevanceScore < config.minRelevanceScore) continue;
      const entry = tally.get(supported.slug) ?? {
        slug: supported.slug,
        title: supported.title,
        support: 0,
        canEnter: false,
        proposals: [],
      };
      entry.support += weight * supported.relevanceScore;
      const proposal =
        vote.proposal?.slug === supported.slug ? vote.proposal : null;
      if (proposal) entry.proposals.push(proposal);
      if (
        canMint &&
        weight * supported.relevanceScore >= config.createRelevanceThreshold
      ) {
        entry.canEnter = true;
      }
      tally.set(supported.slug, entry);
    }
  }
  return tally;
}

export function rankedTopicChallengers(
  active: readonly ActiveTopic[],
  tally: ReadonlyMap<string, TopicTally>,
): TopicTally[] {
  const activeSlugs = new Set(active.map(({ slug }) => slug));
  return [...tally.values()]
    .filter(({ slug }) => !activeSlugs.has(slug))
    .sort(
      (left, right) =>
        right.support - left.support || left.slug.localeCompare(right.slug),
    );
}

export function weakestTopic<T extends ActiveTopic>(
  active: readonly T[],
  tally: ReadonlyMap<string, TopicTally>,
): T | undefined {
  return [...active].sort(
    (left, right) =>
      (tally.get(left.slug)?.support ?? 0) -
        (tally.get(right.slug)?.support ?? 0) ||
      left.id.localeCompare(right.id),
  )[0];
}

export function chooseTopicChallenger<T extends ActiveTopic>(
  active: readonly T[],
  tally: ReadonlyMap<string, TopicTally>,
  ceiling: number,
): { candidate: TopicTally; replace?: T } | null {
  const candidate = rankedTopicChallengers(active, tally).find(
    ({ canEnter }) => canEnter,
  );
  if (!candidate) return null;
  if (active.length < ceiling) return { candidate };
  const replace = weakestTopic(active, tally);
  if (
    !replace ||
    candidate.support <= (tally.get(replace.slug)?.support ?? 0) * 1.25
  )
    return null;
  return { candidate, replace };
}
