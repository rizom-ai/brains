import {
  type BaseEntity,
  type EntityPluginContext,
  type JobHandler,
  scopedDerivedId,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { generateIdFromText } from "@brains/utils/string-utils";
import { createId } from "@brains/utils/id";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import {
  topicVoteSchema,
  topicVoteResponseSchema,
  topicDescriptionResponseSchema,
  type TopicVote,
  type TopicVoteResponse,
} from "../schemas/votes";
import {
  includesTopicSourceType,
  isTopicSourceEligible,
  topicSourcePolicy,
  topicSourceTitle,
} from "./topic-source-policy";
import {
  chooseTopicChallenger,
  rankedTopicChallengers,
  tallyTopicVotes,
  topicSoftCeiling,
  weakestTopic,
  type ActiveTopic,
  type TopicTally,
} from "./topic-selection";
import { TopicAdapter } from "./topic-adapter";
import { TopicService } from "./topic-service";
import { TOPICS_BATCH_COMPLETED_EVENT } from "./constants";

const MAX_AI_CALLS = 10;
const EXECUTION_TIMEOUT_MS = 180_000;
const LEASE_DURATION_MS = EXECUTION_TIMEOUT_MS + 60_000;
const MAX_DESCRIPTION_PROPOSALS = 8;
const MAX_SOURCE_ATTEMPTS = 3;
const SOURCE_PAGE_SIZE = 100;
const leaseSchema = z.object({ owner: z.string(), expiresAt: z.number() });
const failureSchema = z.object({
  contentHash: z.string(),
  attempts: z.number().int().positive(),
});
const jobDataSchema = z.object({});

type SourceFailure = z.output<typeof failureSchema>;

/** What a job keeps per source between AI calls; content is loaded per batch. */
interface SourceRef {
  key: string;
  entityType: string;
  id: string;
  contentHash: string;
}

function sourceKey(source: { entityType: string; id: string }): string {
  return `${source.entityType}:${source.id}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export async function enqueueTopicExtraction(
  context: EntityPluginContext,
  delayMs = 0,
): Promise<string> {
  return context.jobs.enqueue({
    type: "topics:extract",
    data: {},
    options: {
      source: "topics",
      // Entity events are wakeup hints for a corpus-wide maintenance scan, not
      // children of the emitting projection. Do not inherit its causal budget.
      rootJobId: createId(),
      metadata: { operationType: "data_processing", silent: true },
      deduplication: "skip",
      deduplicationKey: "topics:extract",
      delayMs,
    },
  });
}

async function readSourcePages(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  entityType: string,
  signal: AbortSignal,
  offset = 0,
): Promise<SourceRef[]> {
  const page = await context.entityService.listEntities({
    entityType,
    options: {
      limit: SOURCE_PAGE_SIZE,
      offset,
      sortFields: [{ field: "id", direction: "asc" }],
      filter: { visibilityScope: config.extractionVisibility },
      signal,
    },
  });
  const refs = page
    .filter((source) => isTopicSourceEligible(source, config))
    .map((source) => ({
      key: sourceKey(source),
      entityType: source.entityType,
      id: source.id,
      contentHash: source.contentHash,
    }));
  if (page.length < SOURCE_PAGE_SIZE) return refs;
  return [
    ...refs,
    ...(await readSourcePages(
      context,
      config,
      entityType,
      signal,
      offset + SOURCE_PAGE_SIZE,
    )),
  ];
}

/** Eligible sources by key, paged so a large corpus is never held in memory. */
async function readSources(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  signal: AbortSignal,
): Promise<SourceRef[]> {
  signal.throwIfAborted();
  const types = context.entityService
    .getEntityTypes()
    .filter((type) => {
      const typeConfig = context.entityService.getEntityTypeConfig(type);
      return (
        includesTopicSourceType(type, config, typeConfig) &&
        topicSourcePolicy(type, config, typeConfig).weight > 0
      );
    })
    .sort();
  const refs: SourceRef[] = [];
  for (const entityType of types) {
    refs.push(...(await readSourcePages(context, config, entityType, signal)));
  }
  signal.throwIfAborted();
  return refs.sort((left, right) => left.key.localeCompare(right.key));
}

async function loadSources(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  refs: readonly SourceRef[],
): Promise<BaseEntity[]> {
  const loaded = await Promise.all(
    refs.map(({ entityType, id }) =>
      context.entityService.getEntity({
        entityType,
        id,
        visibilityScope: config.extractionVisibility,
      }),
    ),
  );
  // A source deleted or made ineligible since the scan is pruned next scan.
  return loaded.filter(
    (source): source is BaseEntity =>
      source !== null && isTopicSourceEligible(source, config),
  );
}

function normalizeVote(
  source: BaseEntity,
  result: TopicVoteResponse["sources"][number],
  listedTitles: ReadonlySet<string>,
  context: EntityPluginContext,
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
  const policy = topicSourcePolicy(
    source.entityType,
    config,
    context.entityService.getEntityTypeConfig(source.entityType),
  );
  const proposal = result.proposal;
  const slug = proposal ? generateIdFromText(proposal.title) : "";
  return {
    contentHash: source.contentHash,
    visibility: config.extractionVisibility,
    supported: [...supported.values()].sort((left, right) =>
      left.slug.localeCompare(right.slug),
    ),
    proposal:
      policy.canMint &&
      proposal &&
      slug &&
      proposal.relevanceScore >= config.minRelevanceScore
        ? { ...proposal, slug }
        : null,
  };
}

export interface TopicExtractionResult {
  calls: number;
  remaining: number;
}

export function createRankedTopicJobHandler(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  logger: Logger,
): JobHandler<"topics:extract", Record<string, never>, TopicExtractionResult> {
  const votes = context.runtimeState.scoped({
    namespace: "topics.votes",
    schema: topicVoteSchema,
  });
  const failures = context.runtimeState.scoped({
    namespace: "topics.failures",
    schema: failureSchema,
  });
  const leases = context.runtimeState.scoped({
    namespace: "topics.extraction",
    schema: leaseSchema,
  });
  const topics = new TopicService(context.entityService, logger);
  const adapter = new TopicAdapter();

  return {
    executionTimeoutMs: EXECUTION_TIMEOUT_MS,
    validateAndParse: (data): Record<string, never> | null => {
      const parsed = jobDataSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    process: async (
      _data,
      _jobId,
      _progress,
      signal,
    ): Promise<TopicExtractionResult> => {
      signal.throwIfAborted();
      const lease = {
        owner: createId(),
        expiresAt: Date.now() + LEASE_DURATION_MS,
      };
      let acquired = await leases.setIfNotExists("lease", lease);
      if (!acquired) {
        const previous = await leases.get("lease");
        if (previous && previous.expiresAt <= Date.now())
          acquired = await leases.compareAndSet("lease", previous, lease);
      }
      if (!acquired) {
        // skip deduplication preserves one pending successor even while another
        // attempt is processing. A lease keeps those attempts from racing.
        await enqueueTopicExtraction(context, 30_000);
        return { calls: 0, remaining: 0 };
      }

      let calls = 0;
      let changed = 0;
      try {
        let sources = await readSources(context, config, signal);
        const saved = new Map(
          (await votes.list()).map(({ key, value }) => [key, value]),
        );
        const failed = new Map(
          (await failures.list()).map(({ key, value }) => [key, value]),
        );
        const prune = async (): Promise<void> => {
          const eligible = new Set(sources.map(({ key }) => key));
          for (const [store, entries] of [
            [votes, saved],
            [failures, failed],
          ] as const) {
            for (const key of entries.keys()) {
              signal.throwIfAborted();
              if (!eligible.has(key)) {
                await store.delete(key);
                entries.delete(key);
              }
            }
          }
        };
        await prune();
        const isFresh = (source: SourceRef): boolean => {
          const vote = saved.get(source.key);
          return (
            vote?.contentHash === source.contentHash &&
            vote.visibility === config.extractionVisibility
          );
        };
        const attempts = (source: SourceRef): number => {
          const failure = failed.get(source.key);
          return failure?.contentHash === source.contentHash
            ? failure.attempts
            : 0;
        };
        // Existing topics have no votes until their sources are read, so they
        // may only be displaced once every source has been read at least once.
        const allRead = (): boolean =>
          sources.every((source) => isFresh(source) || attempts(source) > 0);
        const tally = (): Map<string, TopicTally> =>
          tallyTopicVotes(
            sources.flatMap((source) => {
              const vote = saved.get(source.key);
              if (!vote || !isFresh(source)) return [];
              return [
                {
                  vote,
                  ...topicSourcePolicy(
                    source.entityType,
                    config,
                    context.entityService.getEntityTypeConfig(
                      source.entityType,
                    ),
                  ),
                },
              ];
            }),
            config,
          );
        const readActive = async (): Promise<ActiveTopic[]> =>
          (
            await topics.listTopics({ visibility: config.extractionVisibility })
          ).map((topic) => {
            const title = adapter.parseTopicBody(topic.content).title;
            return { id: topic.id, title, slug: generateIdFromText(title) };
          });
        let active = await readActive();
        const ceiling = (): number =>
          topicSoftCeiling(sources.length, config.topicSoftCeilingSourceRatio);
        const choose = (): ReturnType<typeof chooseTopicChallenger> => {
          const support = tally();
          const occupiedIds = new Set(active.map(({ id }) => id));
          for (const candidate of support.values()) {
            if (
              occupiedIds.has(
                scopedDerivedId(candidate.slug, config.extractionVisibility),
              )
            )
              candidate.canEnter = false;
          }
          const choice = chooseTopicChallenger(active, support, ceiling());
          return choice?.replace && !allRead() ? null : choice;
        };

        const select = async (): Promise<void> => {
          const support = tally();
          while (allRead() && active.length > ceiling()) {
            signal.throwIfAborted();
            const weakest = weakestTopic(active, support);
            if (!weakest) break;
            await topics.deleteTopic(weakest.id);
            active = active.filter(({ id }) => id !== weakest.id);
            changed++;
          }
          while (calls < MAX_AI_CALLS) {
            signal.throwIfAborted();
            const choice = choose();
            if (!choice) break;
            const { candidate, replace } = choice;
            const proposals = [...candidate.proposals]
              .sort(
                (left, right) =>
                  right.relevanceScore - left.relevanceScore ||
                  left.content.localeCompare(right.content),
              )
              .slice(0, MAX_DESCRIPTION_PROPOSALS);
            const description = await context.ai.generate(
              {
                templateName: "topics:description",
                representedIdentity: "none",
                prompt: `Topic: ${candidate.title}\n\nSupporting proposals:\n${proposals.map(({ content }) => content.slice(0, 2000)).join("\n\n") || candidate.title}`,
              },
              topicDescriptionResponseSchema,
              signal,
            );
            calls++;
            signal.throwIfAborted();
            sources = await readSources(context, config, signal);
            await prune();
            active = await readActive();
            signal.throwIfAborted();
            const currentChoice = choose();
            if (allRead() && active.length > ceiling()) break;
            if (
              currentChoice?.candidate.slug !== candidate.slug ||
              currentChoice.replace?.id !== replace?.id ||
              JSON.stringify(currentChoice.candidate.proposals) !==
                JSON.stringify(candidate.proposals)
            )
              continue;
            // Generate before deleting. Once mutations begin, finish this small
            // commit section; an interrupted retry can fill any vacant slot.
            if (replace) {
              await topics.deleteTopic(replace.id);
              active = active.filter(({ id }) => id !== replace.id);
            }
            await topics.createTopic({
              title: candidate.title,
              content: description.content,
              visibility: config.extractionVisibility,
            });
            active.push({
              id: scopedDerivedId(candidate.slug, config.extractionVisibility),
              slug: candidate.slug,
              title: candidate.title,
            });
            changed++;
          }
        };

        const checkpoint = async (
          key: string,
          vote: TopicVote,
        ): Promise<void> => {
          await votes.set(key, vote);
          saved.set(key, vote);
          if (failed.delete(key)) await failures.delete(key);
        };

        await select();
        const stale = sources.filter((source) => !isFresh(source));
        // A source that failed before is retried alone, so it cannot keep
        // failing the batch it shares with healthy sources.
        const batches = [
          ...stale
            .filter((source) => attempts(source) > 0)
            .map((source) => [source]),
          ...chunk(
            stale.filter((source) => attempts(source) === 0),
            Math.min(4, config.maxEntitiesPerBatch),
          ),
        ];
        const unanswered: BaseEntity[] = [];
        let answeredCalls = 0;
        let lastError: unknown;
        for (const refs of batches) {
          if (calls >= MAX_AI_CALLS) break;
          signal.throwIfAborted();
          const batch = await loadSources(context, config, refs);
          if (batch.length === 0) continue;
          const currentTitles = active
            .map(({ title }) => title)
            .sort()
            .slice(0, ceiling());
          const challengerTitles = rankedTopicChallengers(active, tally())
            .slice(0, ceiling())
            .map(({ title }) => title);
          const listedTitles = new Set([...currentTitles, ...challengerTitles]);
          let response: TopicVoteResponse;
          try {
            response = await context.ai.generate(
              {
                templateName: "topics:votes",
                representedIdentity: "none",
                prompt: [
                  `Current topics:\n${currentTitles.join("\n") || "(none)"}`,
                  `Leading challengers:\n${challengerTitles.join("\n") || "(none)"}`,
                  ...batch.map(
                    (source) =>
                      `---\nSource key: ${sourceKey(source)}\n${source.entityType}: ${topicSourceTitle(source)}\n\n${source.content}`,
                  ),
                ].join("\n\n"),
              },
              topicVoteResponseSchema,
              signal,
            );
          } catch (error) {
            signal.throwIfAborted();
            calls++;
            lastError = error;
            logger.warn("Topic vote call failed", {
              sources: batch.map(sourceKey),
              error: getErrorMessage(error),
            });
            unanswered.push(...batch);
            continue;
          }
          calls++;
          answeredCalls++;
          signal.throwIfAborted();
          const counts = new Map<string, number>();
          for (const { sourceKey: key } of response.sources)
            counts.set(key, (counts.get(key) ?? 0) + 1);
          const results = new Map(
            response.sources.map((result) => [result.sourceKey, result]),
          );
          for (const source of batch) {
            const result = results.get(sourceKey(source));
            // A missing or repeated answer is not attributable to the source.
            if (!result || counts.get(sourceKey(source)) !== 1) {
              unanswered.push(source);
              continue;
            }
            signal.throwIfAborted();
            await checkpoint(
              sourceKey(source),
              normalizeVote(source, result, listedTitles, context, config),
            );
          }
        }
        // Count failures only when the provider answered something in this job;
        // otherwise an outage would abstain healthy sources.
        if (unanswered.length > 0 && answeredCalls === 0) {
          throw lastError;
        }
        for (const source of unanswered) {
          signal.throwIfAborted();
          const key = sourceKey(source);
          const failure = failed.get(key);
          const count =
            (failure?.contentHash === source.contentHash
              ? failure.attempts
              : 0) + 1;
          if (count >= MAX_SOURCE_ATTEMPTS) {
            logger.warn(
              "Topic votes abstained for a repeatedly failing source",
              {
                source: key,
              },
            );
            await checkpoint(key, {
              contentHash: source.contentHash,
              visibility: config.extractionVisibility,
              supported: [],
              proposal: null,
            });
          } else {
            const next: SourceFailure = {
              contentHash: source.contentHash,
              attempts: count,
            };
            await failures.set(key, next);
            failed.set(key, next);
          }
        }
        // Changes during AI calls must not leak ineligible votes into selection.
        // Their original hash makes concurrent edits stale for the successor.
        sources = await readSources(context, config, signal);
        await prune();
        await select();
        const remaining = sources.filter((source) => !isFresh(source)).length;
        if (remaining > 0 || active.length > ceiling() || choose())
          await enqueueTopicExtraction(context);
        if (changed > 0) {
          await context.messaging.send({
            type: TOPICS_BATCH_COMPLETED_EVENT,
            payload: { changed },
            broadcast: true,
          });
        }
        return { calls, remaining };
      } finally {
        // Claim release atomically before deleting: an expired lease may have
        // been taken over by a new worker, whose ownership we must not remove.
        if (
          await leases.compareAndSet("lease", lease, {
            owner: `${lease.owner}:releasing`,
            expiresAt: Date.now() + LEASE_DURATION_MS,
          })
        ) {
          await leases.delete("lease");
        }
      }
    },
  };
}
