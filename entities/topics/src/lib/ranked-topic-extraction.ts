import {
  type BaseEntity,
  type JobEntityAccess,
  scopedDerivedId,
} from "@brains/sdk/entities";
import {
  defineJob,
  type ServiceJobHandlerContext,
  type ServiceJobDefinition,
  type IRuntimeStateNamespace,
  type IRuntimeStateStore,
  type ServiceJobs,
} from "@brains/sdk/services";
import { computeContentHash } from "@brains/utils/hash";
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
import { ownedTopics, type TopicAccess } from "./owned-topics";
import { parseTopicBody } from "./topic-body";
import { TOPICS_BATCH_COMPLETED_EVENT } from "./constants";

type ActiveTopicSnapshot = ActiveTopic & { readonly revision: string };

const MAX_AI_CALLS = 10;
const EXECUTION_TIMEOUT_MS = 180_000;
const LEASE_DURATION_MS = EXECUTION_TIMEOUT_MS + 60_000;
const MAX_DESCRIPTION_PROPOSALS = 8;
const MAX_SOURCE_ATTEMPTS = 3;
const SOURCE_PAGE_SIZE = 100;
const leaseSchema: z.ZodObject<{ owner: z.ZodString; expiresAt: z.ZodNumber }> =
  z.object({ owner: z.string(), expiresAt: z.number() });
const failureSchema: z.ZodObject<{
  revision: z.ZodString;
  attempts: z.ZodNumber;
}> = z.object({
  revision: z.string(),
  attempts: z.number().int().positive(),
});
const jobDataSchema: z.ZodObject<Record<string, never>> = z.strictObject({});
const resultSchema: z.ZodObject<{
  calls: z.ZodNumber;
  remaining: z.ZodNumber;
}> = z.object({ calls: z.number(), remaining: z.number() });
export interface ExtractionContext
  extends
    Pick<
      ServiceJobHandlerContext<Record<string, never>>,
      "ai" | "logger" | "signal" | "template"
    >,
    TopicAccess {
  readonly entities: Pick<
    JobEntityAccess,
    "listEntities" | "getEntity" | "getEntityTypes" | "getSourcePolicy"
  >;
  enqueue(delayMs?: number): Promise<void>;
  changed(count: number): Promise<void>;
}
export type Checkpoint<T> = Pick<
  IRuntimeStateStore<T>,
  "get" | "set" | "setIfNotExists" | "compareAndSet" | "delete" | "list"
>;
export interface TopicCheckpoints {
  readonly votes: Checkpoint<TopicVote>;
  readonly failures: Checkpoint<SourceFailure>;
  readonly leases: Checkpoint<z.output<typeof leaseSchema>>;
}
export type RankedTopicJob = ServiceJobDefinition<
  "extract",
  typeof jobDataSchema,
  typeof resultSchema
>;

type SourceFailure = z.output<typeof failureSchema>;

/** What a job keeps per source between AI calls; content is loaded per batch. */
interface SourceRef {
  key: string;
  entityType: string;
  id: string;
  revision: string;
}

/** Metadata and visibility changes invalidate votes even when the body hash is unchanged. */
export function sourceRevision(source: BaseEntity): string {
  return computeContentHash(
    JSON.stringify([source.contentHash, source.metadata, source.visibility]),
  );
}

function sourceKey(source: { entityType: string; id: string }): string {
  return `${source.entityType}:${source.id}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function readSourcePages(
  context: ExtractionContext,
  config: TopicsPluginConfig,
  entityType: string,
  signal: AbortSignal,
  offset = 0,
): Promise<SourceRef[]> {
  const page = await context.entities.listEntities({
    entityType,
    options: {
      limit: SOURCE_PAGE_SIZE,
      publishedOnly: config.extractionVisibility === "public",
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
      revision: sourceRevision(source),
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

/** Bodies are paged; the complete source-reference set is retained in memory. */
async function readSources(
  context: ExtractionContext,
  config: TopicsPluginConfig,
  signal: AbortSignal,
): Promise<SourceRef[]> {
  signal.throwIfAborted();
  const types = context.entities
    .getEntityTypes()
    .filter((type) => {
      const typeConfig = context.entities.getSourcePolicy(type);
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
  context: ExtractionContext,
  config: TopicsPluginConfig,
  refs: readonly SourceRef[],
): Promise<BaseEntity[]> {
  const loaded = await Promise.all(
    refs.map(({ entityType, id }) =>
      context.entities.getEntity({
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
  context: ExtractionContext,
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
    context.entities.getSourcePolicy(source.entityType),
  );
  const proposal = result.proposal;
  const slug = proposal ? generateIdFromText(proposal.title) : "";
  return {
    revision: sourceRevision(source),
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

export function createTopicCheckpoints(
  runtimeState: IRuntimeStateNamespace,
): TopicCheckpoints {
  return {
    votes: runtimeState.scoped({
      namespace: "topics.votes",
      schema: topicVoteSchema,
    }),
    failures: runtimeState.scoped({
      namespace: "topics.failures",
      schema: failureSchema,
    }),
    leases: runtimeState.scoped({
      namespace: "topics.extraction",
      schema: leaseSchema,
    }),
  };
}

export function createRankedTopicJob(
  config: TopicsPluginConfig,
  runtimeState: IRuntimeStateNamespace,
  jobs: ServiceJobs,
): ReturnType<RankedTopicJob["handle"]> {
  const state = createTopicCheckpoints(runtimeState);
  const job: RankedTopicJob = defineJob({
    name: "extract",
    input: jobDataSchema,
    output: resultSchema,
    causality: "independent",
    oncePending: () => "extract",
    deadline: `${EXECUTION_TIMEOUT_MS}ms`,
  });
  return job.handle((context) =>
    runRankedTopicExtraction(
      {
        ...context,
        ...ownedTopics(context.entities, config.extractionVisibility),
        enqueue: async (delayMs = 0) => {
          context.signal.throwIfAborted();
          await jobs.enqueue(job, {}, { delayMs });
        },
        changed: (changed) =>
          context.messaging.publish({
            topic: TOPICS_BATCH_COMPLETED_EVENT,
            data: { changed },
          }),
      },
      config,
      state,
    ),
  );
}

/** The job and provider-backed evals drive the same ranked algorithm. */
export async function runRankedTopicExtraction(
  context: ExtractionContext,
  config: TopicsPluginConfig,
  { votes, failures, leases }: TopicCheckpoints,
): Promise<TopicExtractionResult> {
  const { signal, logger } = context;
  signal.throwIfAborted();
  if (!config.enableAutoExtraction) return { calls: 0, remaining: 0 };
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
    signal.throwIfAborted();
    await context.enqueue(30_000);
    return { calls: 0, remaining: 0 };
  }

  const assertLease = async (): Promise<void> => {
    signal.throwIfAborted();
    const current = await leases.get("lease");
    signal.throwIfAborted();
    if (
      lease.expiresAt <= Date.now() ||
      current?.owner !== lease.owner ||
      current.expiresAt !== lease.expiresAt
    ) {
      throw new Error("Topic extraction lease was superseded");
    }
  };
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
            await assertLease();
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
        vote?.revision === source.revision &&
        vote.visibility === config.extractionVisibility
      );
    };
    const attempts = (source: SourceRef): number => {
      const failure = failed.get(source.key);
      return failure?.revision === source.revision ? failure.attempts : 0;
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
                context.entities.getSourcePolicy(source.entityType),
              ),
            },
          ];
        }),
        config,
      );
    const readActive = async (): Promise<ActiveTopicSnapshot[]> =>
      (await context.readTopics())
        .filter(
          ({ entity }) => entity.visibility === config.extractionVisibility,
        )
        .map(({ entity, version }) => {
          const title = parseTopicBody(entity.content).title;
          return {
            id: entity.id,
            title,
            slug: generateIdFromText(title),
            revision: version,
          };
        });
    let active = await readActive();
    const ceiling = (): number =>
      topicSoftCeiling(sources.length, config.topicSoftCeilingSourceRatio);
    const choose = (): ReturnType<
      typeof chooseTopicChallenger<ActiveTopicSnapshot>
    > => {
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
        await assertLease();
        await context.deleteTopic(weakest.id, weakest.revision);
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
            templateName: context.template("description"),
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
          currentChoice.replace?.revision !== replace?.revision ||
          JSON.stringify(currentChoice.candidate.proposals) !==
            JSON.stringify(candidate.proposals)
        )
          continue;
        // Generate before deleting. Replacement is NOT atomic: cancellation
        // or interruption after deletion leaves a vacancy for a later run.
        await assertLease();
        if (replace) {
          await context.deleteTopic(replace.id, replace.revision);
          active = active.filter(({ id }) => id !== replace.id);
        }
        await assertLease();
        await context.createTopic({
          id: scopedDerivedId(candidate.slug, config.extractionVisibility),
          title: candidate.title,
          content: description.content,
          visibility: config.extractionVisibility,
        });
        active = await readActive();
        changed++;
      }
    };

    const checkpoint = async (key: string, vote: TopicVote): Promise<void> => {
      await assertLease();
      await votes.set(key, vote);
      saved.set(key, vote);
      if (failed.delete(key)) {
        await assertLease();
        await failures.delete(key);
      }
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
            templateName: context.template("votes"),
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
        const latest = await context.entities.getEntity({
          entityType: source.entityType,
          id: source.id,
          visibilityScope: config.extractionVisibility,
        });
        if (
          !latest ||
          !isTopicSourceEligible(latest, config) ||
          sourceRevision(latest) !== sourceRevision(source)
        )
          continue;
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
        (failure?.revision === sourceRevision(source) ? failure.attempts : 0) +
        1;
      if (count >= MAX_SOURCE_ATTEMPTS) {
        logger.warn("Topic votes abstained for a repeatedly failing source", {
          source: key,
        });
        await checkpoint(key, {
          revision: sourceRevision(source),
          visibility: config.extractionVisibility,
          supported: [],
          proposal: null,
        });
      } else {
        const next: SourceFailure = {
          revision: sourceRevision(source),
          attempts: count,
        };
        await assertLease();
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
    if (remaining > 0 || active.length > ceiling() || choose()) {
      await assertLease();
      await context.enqueue();
    }
    if (changed > 0) {
      await assertLease();
      await context.changed(changed);
    }
    return { calls, remaining };
  } finally {
    // One CAS releases our claim. Never delete after CAS: a paused old
    // releaser could otherwise delete a replacement worker's lease.
    await leases.compareAndSet("lease", lease, {
      owner: `${lease.owner}:released`,
      expiresAt: 0,
    });
  }
}
