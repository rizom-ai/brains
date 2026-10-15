import { scopedDerivedId, type BaseEntity } from "@brains/plugins";
import { generateIdFromText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import type {
  TopicSelection,
  TopicVote,
  TopicVoteResponse,
} from "../schemas/votes";
import { topicSourceTitle } from "./topic-source-policy";
import {
  chooseTopicChallenger,
  isTopicTitleAllowed,
  rankedTopicChallengers,
  type ActiveTopic,
  type TopicTally,
} from "./topic-selection";

const MAX_DESCRIPTION_PROPOSALS = 8;

export const sourceFailureSchema: z.ZodObject<{
  contentHash: z.ZodString;
  attempts: z.ZodNumber;
}> = z.object({
  contentHash: z.string(),
  attempts: z.number().int().positive(),
});

export type SourceFailure = z.output<typeof sourceFailureSchema>;

/** What a job keeps per source between AI calls; content is loaded per batch. */
export interface SourceRef {
  key: string;
  entityType: string;
  id: string;
  contentHash: string;
}

/** The votes and failures recorded so far, read against the current prompt. */
export interface VoteLedger {
  readonly votes: ReadonlyMap<string, TopicVote>;
  readonly failures: ReadonlyMap<string, SourceFailure>;
  readonly promptVersion: string;
  readonly visibility: TopicsPluginConfig["extractionVisibility"];
}

export type TopicChoice = NonNullable<ReturnType<typeof chooseTopicChallenger>>;

type VoteAnswer = TopicVoteResponse["sources"][number];

export function sourceKey(source: { entityType: string; id: string }): string {
  return `${source.entityType}:${source.id}`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

/** A vote counts only under the source's content, votes prompt and visibility. */
export function isVoteFresh(
  ledger: VoteLedger,
  source: Pick<SourceRef, "key" | "contentHash">,
): boolean {
  const vote = ledger.votes.get(source.key);
  return (
    vote?.contentHash === source.contentHash &&
    vote.promptVersion === ledger.promptVersion &&
    vote.visibility === ledger.visibility
  );
}

/** Failed attempts at reading this content; an edit starts the count over. */
export function failedAttempts(
  failures: ReadonlyMap<string, SourceFailure>,
  source: { entityType: string; id: string; contentHash: string },
): number {
  const failure = failures.get(sourceKey(source));
  return failure?.contentHash === source.contentHash ? failure.attempts : 0;
}

/**
 * Existing topics have no votes until their sources are read, so they may
 * only be displaced once every source has been read at least once.
 */
export function allSourcesRead(
  ledger: VoteLedger,
  sources: readonly SourceRef[],
): boolean {
  return sources.every(
    (source) =>
      isVoteFresh(ledger, source) ||
      failedAttempts(ledger.failures, source) > 0,
  );
}

/**
 * The stale sources in vote batches. A source that failed before is retried
 * alone, so it cannot keep failing the batch it shares with healthy sources.
 */
export function voteBatches(
  ledger: VoteLedger,
  sources: readonly SourceRef[],
  batchSize: number,
): SourceRef[][] {
  const stale = sources.filter((source) => !isVoteFresh(ledger, source));
  const failing = (source: SourceRef): boolean =>
    failedAttempts(ledger.failures, source) > 0;
  return [
    ...stale.filter(failing).map((source) => [source]),
    ...chunk(
      stale.filter((source) => !failing(source)),
      batchSize,
    ),
  ];
}

/**
 * Topics chosen under an earlier prompt no longer steer the votes; once
 * every source is read again they stay only if the new votes support them.
 */
export function earlierTopicIds(
  selection: TopicSelection | null,
  promptVersion: string,
  active: readonly ActiveTopic[],
): Set<string> {
  return new Set(
    selection?.promptVersion === promptVersion
      ? selection.earlier
      : selection
        ? active.map(({ id }) => id)
        : [],
  );
}

/**
 * The challenger to bring in next. A candidate whose id an existing topic
 * already holds cannot enter, and replacing a topic waits until every source
 * is read.
 */
export function chooseChallenger(
  active: readonly ActiveTopic[],
  support: ReadonlyMap<string, TopicTally>,
  ceiling: number,
  {
    visibility,
    allRead,
  }: {
    visibility: TopicsPluginConfig["extractionVisibility"];
    allRead: boolean;
  },
): TopicChoice | null {
  const occupiedIds = new Set(active.map(({ id }) => id));
  const open = new Map(
    [...support].map(([slug, candidate]) => [
      slug,
      occupiedIds.has(scopedDerivedId(candidate.slug, visibility))
        ? { ...candidate, canEnter: false }
        : candidate,
    ]),
  );
  const choice = chooseTopicChallenger(active, open, ceiling);
  return choice?.replace && !allRead ? null : choice;
}

/** Whether a choice still stands with the same candidate, slot and evidence. */
export function isSameChoice(
  current: TopicChoice | null,
  previous: TopicChoice,
): boolean {
  return (
    current?.candidate.slug === previous.candidate.slug &&
    current.replace?.id === previous.replace?.id &&
    JSON.stringify(current.candidate.proposals) ===
      JSON.stringify(previous.candidate.proposals)
  );
}

/** Topics by support, strongest first; merging keeps the stronger topic. */
export function strongestFirst(
  active: readonly ActiveTopic[],
  support: ReadonlyMap<string, TopicTally>,
): ActiveTopic[] {
  const strength = (topic: ActiveTopic): number =>
    support.get(topic.slug)?.support ?? 0;
  return [...active].sort(
    (left, right) =>
      strength(right) - strength(left) || left.id.localeCompare(right.id),
  );
}

/** The titles a vote may support: current topics and leading challengers. */
export function votePromptTitles(
  active: readonly ActiveTopic[],
  earlier: ReadonlySet<string>,
  support: ReadonlyMap<string, TopicTally>,
  ceiling: number,
  config: Pick<TopicsPluginConfig, "excludeTitleTerms">,
): { current: string[]; challengers: string[] } {
  return {
    current: active
      .filter(
        ({ id, title }) =>
          !earlier.has(id) && isTopicTitleAllowed(title, config),
      )
      .map(({ title }) => title)
      .sort()
      .slice(0, ceiling),
    challengers: rankedTopicChallengers(active, support)
      .filter(({ title }) => isTopicTitleAllowed(title, config))
      .slice(0, ceiling)
      .map(({ title }) => title),
  };
}

export function votePrompt(
  titles: { current: readonly string[]; challengers: readonly string[] },
  batch: readonly BaseEntity[],
): string {
  return [
    `Current topics:\n${titles.current.join("\n") || "(none)"}`,
    `Leading challengers:\n${titles.challengers.join("\n") || "(none)"}`,
    ...batch.map(
      (source) =>
        `---\nSource key: ${sourceKey(source)}\n${source.entityType}: ${topicSourceTitle(source)}\n\n${source.content}`,
    ),
  ].join("\n\n");
}

export function descriptionPrompt(candidate: TopicTally): string {
  const proposals = [...candidate.proposals]
    .sort(
      (left, right) =>
        right.relevanceScore - left.relevanceScore ||
        left.content.localeCompare(right.content),
    )
    .slice(0, MAX_DESCRIPTION_PROPOSALS);
  return `Topic: ${candidate.title}\n\nSupporting proposals:\n${proposals.map(({ content }) => content.slice(0, 2000)).join("\n\n") || candidate.title}`;
}

/**
 * The answer for each source in the batch, by source key. A missing or
 * repeated answer is not attributable to the source.
 */
export function attributableAnswers(
  batch: readonly BaseEntity[],
  answers: readonly VoteAnswer[],
): Map<string, VoteAnswer> {
  const counts = new Map<string, number>();
  for (const { sourceKey: key } of answers)
    counts.set(key, (counts.get(key) ?? 0) + 1);
  const results = new Map(answers.map((answer) => [answer.sourceKey, answer]));
  return new Map(
    batch.flatMap((source) => {
      const key = sourceKey(source);
      const result = results.get(key);
      return result && counts.get(key) === 1 ? [[key, result] as const] : [];
    }),
  );
}

export function normalizeVote(
  source: Pick<BaseEntity, "contentHash">,
  promptVersion: string,
  result: VoteAnswer,
  listedTitles: ReadonlySet<string>,
  canMint: boolean,
  config: TopicsPluginConfig,
): TopicVote {
  const supported = new Map<string, TopicVote["supported"][number]>();
  for (const support of result.supported) {
    // A title the model did not copy exactly is not a vote for a listed topic.
    if (!listedTitles.has(support.title)) continue;
    if (support.relevanceScore < config.minRelevanceScore) continue;
    const slug = generateIdFromText(support.title);
    if (!slug) continue;
    const existing = supported.get(slug);
    if (!existing || existing.relevanceScore < support.relevanceScore)
      supported.set(slug, { ...support, slug });
  }
  const proposal = result.proposal;
  const slug = proposal ? generateIdFromText(proposal.title) : "";
  return {
    contentHash: source.contentHash,
    promptVersion,
    visibility: config.extractionVisibility,
    supported: [...supported.values()].sort((left, right) =>
      left.slug.localeCompare(right.slug),
    ),
    proposal:
      canMint &&
      proposal &&
      slug &&
      proposal.relevanceScore >= config.minRelevanceScore
        ? { ...proposal, slug }
        : null,
  };
}
