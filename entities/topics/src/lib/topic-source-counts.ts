import type { TopicsPluginConfig } from "../schemas/config";
import type { TopicVote } from "../schemas/votes";
import { isVoteFresh, type SourceRef } from "./topic-extraction-decisions";
import { foldTopicAliases, tallyTopicVotes } from "./topic-selection";

export interface TopicSourceCountInput {
  /** The sources to count, with their current content hashes. */
  sources: readonly Pick<SourceRef, "key" | "contentHash">[];
  /** Extraction's votes, by source key. */
  votes: ReadonlyMap<string, TopicVote>;
  /** A slug merged into another topic, by slug. */
  aliases: ReadonlyMap<string, string>;
  /** The votes prompt current votes are cast under. */
  promptVersion: string;
  config: TopicsPluginConfig;
}

export interface TopicSourceCounts {
  /** Sources supporting each topic slug, merged slugs folded into the topic that absorbed them. */
  bySlug: Map<string, number>;
  /** Sources with no fresh vote: not yet read under their content and the current prompt. */
  unattributed: number;
}

/**
 * How many sources support each topic, read as extraction reads them: a
 * source counts once for each topic its fresh vote supports at or above the
 * minimum relevance, after merged slugs are folded in.
 */
export function countTopicSources({
  sources,
  votes,
  aliases,
  promptVersion,
  config,
}: TopicSourceCountInput): TopicSourceCounts {
  const ledger = {
    votes,
    failures: new Map(),
    promptVersion,
    visibility: config.extractionVisibility,
  };
  const supported = sources.map((source) => {
    const vote = votes.get(source.key);
    if (!vote || !isVoteFresh(ledger, source)) return null;
    // One source's tally holds each slug it supports once, aliases folded.
    return [
      ...foldTopicAliases(
        tallyTopicVotes([{ vote, weight: 1, canMint: false }], config),
        aliases,
      ).keys(),
    ];
  });
  const bySlug = supported
    .flatMap((slugs) => slugs ?? [])
    .reduce(
      (counts, slug) => counts.set(slug, (counts.get(slug) ?? 0) + 1),
      new Map<string, number>(),
    );
  return {
    bySlug,
    unattributed: supported.filter((slugs) => slugs === null).length,
  };
}
