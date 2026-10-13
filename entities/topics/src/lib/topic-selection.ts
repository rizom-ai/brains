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

/**
 * A topic names one concept other brains can match: never two joined by
 * "and", "or", "&" or "/", never built on a term the brain excludes.
 */
export function isTopicTitleAllowed(
  title: string,
  config: Pick<TopicsPluginConfig, "excludeTitleTerms">,
): boolean {
  if (/[&/]/.test(title) || /\b(?:and|or)\b/i.test(title)) return false;
  const words = title.toLowerCase().split(/[^\p{L}\p{N}']+/u);
  return !config.excludeTitleTerms.some((term) =>
    words.some((word) => word.startsWith(term.toLowerCase())),
  );
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
        weight * supported.relevanceScore >= config.createRelevanceThreshold &&
        isTopicTitleAllowed(entry.title, config)
      ) {
        entry.canEnter = true;
      }
      tally.set(supported.slug, entry);
    }
  }
  return tally;
}

/**
 * Support for a slug merged into another counts for the topic it was merged
 * into, following merges in turn; the merged slug never stands on its own.
 */
export function foldTopicAliases(
  tally: ReadonlyMap<string, TopicTally>,
  aliases: ReadonlyMap<string, string>,
): Map<string, TopicTally> {
  const canonical = (slug: string, seen = new Set<string>()): string => {
    const next = aliases.get(slug);
    return next === undefined || seen.has(next)
      ? slug
      : canonical(next, new Set([...seen, slug]));
  };
  const folded = new Map<string, TopicTally>();
  for (const entry of tally.values()) {
    const slug = canonical(entry.slug);
    const existing = folded.get(slug);
    if (!existing) {
      folded.set(slug, { ...entry, slug, proposals: [...entry.proposals] });
      continue;
    }
    existing.support += entry.support;
    existing.proposals.push(...entry.proposals);
    existing.canEnter = existing.canEnter || entry.canEnter;
    if (entry.slug === slug) existing.title = entry.title;
  }
  return folded;
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

export function weakestTopic(
  active: readonly ActiveTopic[],
  tally: ReadonlyMap<string, TopicTally>,
): ActiveTopic | undefined {
  return [...active].sort(
    (left, right) =>
      (tally.get(left.slug)?.support ?? 0) -
        (tally.get(right.slug)?.support ?? 0) ||
      left.id.localeCompare(right.id),
  )[0];
}

export function chooseTopicChallenger(
  active: readonly ActiveTopic[],
  tally: ReadonlyMap<string, TopicTally>,
  ceiling: number,
): { candidate: TopicTally; replace?: ActiveTopic } | null {
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
