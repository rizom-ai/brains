import {
  SemanticIndexingDisabledError,
  type BaseEntity,
  type EntityPluginContext,
  type IRuntimeStateStore,
  scopedDerivedId,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { generateIdFromText } from "@brains/utils/string-utils";
import { computeContentHash } from "@brains/utils/hash";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import {
  topicSelectionSchema,
  topicVoteSchema,
  topicVoteResponseSchema,
  topicDescriptionResponseSchema,
  type TopicSelection,
  type TopicVote,
  type TopicVoteResponse,
} from "../schemas/votes";
import {
  isTopicSourceEligible,
  topicSourcePolicy,
  topicSourceTypes,
} from "./topic-source-policy";
import {
  foldTopicAliases,
  isTopicTitleAllowed,
  tallyTopicVotes,
  topicSoftCeiling,
  weakestTopic,
  type ActiveTopic,
  type TopicTally,
} from "./topic-selection";
import {
  allSourcesRead,
  attributableAnswers,
  chooseChallenger,
  descriptionPrompt,
  earlierTopicIds,
  failedAttempts,
  isSameChoice,
  isVoteFresh,
  normalizeVote,
  sourceFailureSchema,
  sourceKey,
  strongestFirst,
  voteBatches,
  votePrompt,
  votePromptTitles,
  type SourceFailure,
  type SourceRef,
  type TopicChoice,
  type VoteLedger,
} from "./topic-extraction-decisions";
import { TopicAdapter } from "./topic-adapter";
import { TopicService } from "./topic-service";
import { TopicMergeSynthesizer } from "./topic-merge-synthesizer";
import {
  SOURCES_PER_TOPIC,
  duplicateTopics,
  type TopicNeighbourhood,
} from "./topic-ownership";
import { topicVoteTemplate } from "../templates/vote-template";

const MAX_AI_CALLS = 10;
const MAX_SOURCE_ATTEMPTS = 3;
const SOURCE_PAGE_SIZE = 100;

export interface TopicExtractionStores {
  votes: IRuntimeStateStore<TopicVote>;
  failures: IRuntimeStateStore<SourceFailure>;
  /** A slug merged into another topic, by slug. */
  aliases: IRuntimeStateStore<string>;
  /** Pairs of slugs judged distinct. */
  distinctPairs: IRuntimeStateStore<true>;
  selections: IRuntimeStateStore<TopicSelection>;
}

export interface TopicExtractionDeps {
  context: EntityPluginContext;
  config: TopicsPluginConfig;
  logger: Logger;
  stores: TopicExtractionStores;
  topics: TopicService;
  adapter: TopicAdapter;
  synthesizer: TopicMergeSynthesizer;
}

export function topicExtractionDeps(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  logger: Logger,
): TopicExtractionDeps {
  return {
    context,
    config,
    logger,
    stores: {
      votes: context.runtimeState.scoped({
        namespace: "topics.votes",
        schema: topicVoteSchema,
      }),
      failures: context.runtimeState.scoped({
        namespace: "topics.failures",
        schema: sourceFailureSchema,
      }),
      aliases: context.runtimeState.scoped({
        namespace: "topics.aliases",
        schema: z.string(),
      }),
      distinctPairs: context.runtimeState.scoped({
        namespace: "topics.distinct",
        schema: z.literal(true),
      }),
      selections: context.runtimeState.scoped({
        namespace: "topics.selection",
        schema: topicSelectionSchema,
      }),
    },
    topics: new TopicService(context.entityService, logger),
    adapter: new TopicAdapter(),
    synthesizer: new TopicMergeSynthesizer(context, logger),
  };
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
  const types = topicSourceTypes(context.entityService, config);
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

async function entries<T>(
  store: IRuntimeStateStore<T>,
): Promise<Map<string, T>> {
  return new Map((await store.list()).map(({ key, value }) => [key, value]));
}

type BatchOutcome =
  | { answered: true; unanswered: BaseEntity[] }
  | { answered: false; unanswered: BaseEntity[]; error: unknown };

/**
 * One extraction job's view of the corpus: the eligible sources, their votes
 * and failures, and the active topics. Each step reads and updates it, and
 * spends AI calls from one budget.
 */
export class TopicExtractionRun {
  /** AI calls spent; the job stops calling at MAX_AI_CALLS. */
  calls = 0;
  /** Topics created, removed or merged; announced when the job ends. */
  changed = 0;
  private sources: SourceRef[] = [];
  private saved = new Map<string, TopicVote>();
  private failed = new Map<string, SourceFailure>();
  private merged = new Map<string, string>();
  private distinct = new Set<string>();
  private active: ActiveTopic[] = [];
  private earlier = new Set<string>();

  private readonly deps: TopicExtractionDeps;
  private readonly signal: AbortSignal;
  private readonly promptVersion: string;

  private constructor(
    deps: TopicExtractionDeps,
    signal: AbortSignal,
    promptVersion: string,
  ) {
    this.deps = deps;
    this.signal = signal;
    this.promptVersion = promptVersion;
  }

  static async load(
    deps: TopicExtractionDeps,
    signal: AbortSignal,
  ): Promise<TopicExtractionRun> {
    // Votes are cast under the votes prompt; an edited prompt re-reads all.
    const promptVersion = computeContentHash(
      await deps.context.prompts.resolve(
        topicVoteTemplate.name,
        topicVoteTemplate.basePrompt ?? "",
      ),
    );
    const run = new TopicExtractionRun(deps, signal, promptVersion);
    await run.loadState();
    return run;
  }

  private async loadState(): Promise<void> {
    const { stores } = this.deps;
    this.sources = await this.readSources();
    this.saved = await entries(stores.votes);
    this.failed = await entries(stores.failures);
    await this.prune();
    this.merged = await entries(stores.aliases);
    this.distinct = new Set(
      (await stores.distinctPairs.list()).map(({ key }) => key),
    );
    this.active = await this.readActive();
    const selection = await stores.selections.get("current");
    this.earlier = earlierTopicIds(selection, this.promptVersion, this.active);
    if (selection?.promptVersion !== this.promptVersion)
      await this.recordSelection();
  }

  /** Sources whose current content has no vote under the current prompt. */
  remaining(): number {
    return this.sources.filter((source) => !this.isFresh(source)).length;
  }

  /** Whether selection has work left for a successor job. */
  selectionPending(): boolean {
    return this.active.length > this.ceiling() || this.choose() !== null;
  }

  /** Re-read the eligible sources and drop what no longer belongs to them. */
  async rescan(): Promise<void> {
    this.sources = await this.readSources();
    await this.prune();
  }

  async select(): Promise<void> {
    await this.dropUnsupportedEarlier();
    await this.dropDisallowedTitles();
    if (this.deps.config.autoMerge && this.allRead()) {
      await this.mergeNearDuplicates();
      await this.mergeDuplicates();
    }
    await this.trimToCeiling();
    await this.admitChallengers();
  }

  async vote(): Promise<void> {
    const outcomes: BatchOutcome[] = [];
    for (const refs of voteBatches(
      this.ledger(),
      this.sources,
      Math.min(4, this.deps.config.maxEntitiesPerBatch),
    )) {
      if (this.calls >= MAX_AI_CALLS) break;
      this.signal.throwIfAborted();
      const outcome = await this.voteOn(refs);
      if (outcome) outcomes.push(outcome);
    }
    const unanswered = outcomes.flatMap((outcome) => outcome.unanswered);
    // Count failures only when the provider answered something in this job;
    // otherwise an outage would abstain healthy sources.
    const failedCalls = outcomes.flatMap((outcome) =>
      outcome.answered ? [] : [outcome],
    );
    if (unanswered.length > 0 && failedCalls.length === outcomes.length) {
      throw failedCalls.at(-1)?.error;
    }
    await this.recordFailures(unanswered);
  }

  private ledger(): VoteLedger {
    return {
      votes: this.saved,
      failures: this.failed,
      promptVersion: this.promptVersion,
      visibility: this.deps.config.extractionVisibility,
    };
  }

  private isFresh(source: SourceRef): boolean {
    return isVoteFresh(this.ledger(), source);
  }

  private allRead(): boolean {
    return allSourcesRead(this.ledger(), this.sources);
  }

  private ceiling(): number {
    return topicSoftCeiling(
      this.sources.length,
      this.deps.config.topicSoftCeilingSourceRatio,
    );
  }

  private policy(entityType: string): ReturnType<typeof topicSourcePolicy> {
    return topicSourcePolicy(
      entityType,
      this.deps.config,
      this.deps.context.entityService.getEntityTypeConfig(entityType),
    );
  }

  private tally(): Map<string, TopicTally> {
    return foldTopicAliases(
      tallyTopicVotes(
        this.sources.flatMap((source) => {
          const vote = this.saved.get(source.key);
          if (!vote || !this.isFresh(source)) return [];
          return [{ vote, ...this.policy(source.entityType) }];
        }),
        this.deps.config,
      ),
      this.merged,
    );
  }

  private choose(): TopicChoice | null {
    return chooseChallenger(this.active, this.tally(), this.ceiling(), {
      visibility: this.deps.config.extractionVisibility,
      allRead: this.allRead(),
    });
  }

  private async readSources(): Promise<SourceRef[]> {
    return readSources(this.deps.context, this.deps.config, this.signal);
  }

  private async readActive(): Promise<ActiveTopic[]> {
    const { topics, adapter, config } = this.deps;
    return (
      await topics.listTopics({ visibility: config.extractionVisibility })
    ).map((topic) => {
      const title = adapter.parseTopicBody(topic.content).title;
      return { id: topic.id, title, slug: generateIdFromText(title) };
    });
  }

  private async prune(): Promise<void> {
    const { votes, failures } = this.deps.stores;
    const eligible = new Set(this.sources.map(({ key }) => key));
    for (const [store, stored] of [
      [votes, this.saved],
      [failures, this.failed],
    ] as const) {
      for (const key of stored.keys()) {
        this.signal.throwIfAborted();
        if (!eligible.has(key)) {
          await store.delete(key);
          stored.delete(key);
        }
      }
    }
  }

  private async recordSelection(): Promise<void> {
    const ids = new Set(this.active.map(({ id }) => id));
    this.earlier = new Set([...this.earlier].filter((id) => ids.has(id)));
    await this.deps.stores.selections.set("current", {
      promptVersion: this.promptVersion,
      earlier: [...this.earlier].sort(),
    });
  }

  private async removeTopic(id: string): Promise<void> {
    await this.deps.topics.deleteTopic(id);
    this.active = this.active.filter((topic) => topic.id !== id);
    this.changed++;
  }

  /** A duplicate leaves, and its votes count for the topic it duplicates. */
  private async absorb(topic: ActiveTopic, into: ActiveTopic): Promise<void> {
    await this.removeTopic(topic.id);
    await this.deps.stores.aliases.set(topic.slug, into.slug);
    this.merged.set(topic.slug, into.slug);
  }

  private async dropUnsupportedEarlier(): Promise<void> {
    if (!this.allRead() || this.earlier.size === 0) return;
    const support = this.tally();
    for (const topic of this.active.filter(({ id }) => this.earlier.has(id))) {
      this.signal.throwIfAborted();
      if ((support.get(topic.slug)?.support ?? 0) > 0) continue;
      await this.removeTopic(topic.id);
    }
    this.earlier = new Set();
    await this.recordSelection();
  }

  /** A topic whose title breaks the title rules cannot be chosen again. */
  private async dropDisallowedTitles(): Promise<void> {
    if (!this.allRead()) return;
    for (const topic of this.active.filter(
      ({ title }) => !isTopicTitleAllowed(title, this.deps.config),
    )) {
      this.signal.throwIfAborted();
      await this.removeTopic(topic.id);
    }
  }

  /**
   * Topics whose stored embeddings sit within the merge distance are judged
   * once; a duplicate leaves and its votes count for the topic it
   * duplicates. Strongest topics are kept first.
   */
  private async mergeNearDuplicates(): Promise<void> {
    const { context, config, topics, adapter, synthesizer } = this.deps;
    for (const topic of strongestFirst(this.active, this.tally())) {
      if (!this.active.some(({ id }) => id === topic.id)) continue;
      this.signal.throwIfAborted();
      let near: Awaited<
        ReturnType<typeof context.entityService.nearestToEntity>
      >;
      try {
        near = await context.entityService.nearestToEntity({
          origin: { entityType: "topic", entityId: topic.id },
          types: ["topic"],
          maxDistance: config.semanticMergeDistance,
          visibilityScope: config.extractionVisibility,
        });
      } catch (error) {
        // Without embeddings nothing is near anything: keep every topic.
        if (error instanceof SemanticIndexingDisabledError) return;
        throw error;
      }
      for (const { entityId } of near) {
        const other = this.active.find(({ id }) => id === entityId);
        if (!other) continue;
        const pair = [topic.slug, other.slug].sort().join("|");
        if (this.distinct.has(pair)) continue;
        if (this.calls >= MAX_AI_CALLS) return;
        const [kept, absorbed] = await Promise.all([
          topics.getTopic(topic.id, config.extractionVisibility),
          topics.getTopic(other.id, config.extractionVisibility),
        ]);
        if (!kept || !absorbed) continue;
        const verdict = await synthesizer.synthesize(
          {
            existingTopic: kept,
            incomingTopic: {
              title: other.title,
              content: adapter.parseTopicBody(absorbed.content).content,
              relevanceScore: 1,
            },
          },
          this.signal,
        );
        this.calls++;
        this.signal.throwIfAborted();
        if (verdict.verdict === "distinct") {
          await this.deps.stores.distinctPairs.set(pair, true);
          this.distinct.add(pair);
          continue;
        }
        await this.absorb(other, topic);
      }
    }
  }

  /**
   * A topic that owns none of its nearest sources, most of them owned by one
   * other topic, duplicates it: it joins that topic, its votes with it. A
   * broad topic whose sources are spread stays.
   */
  private async mergeDuplicates(): Promise<void> {
    const { context, config } = this.deps;
    const types = topicSourceTypes(context.entityService, config);
    if (types.length === 0) return;
    let neighbourhoods: TopicNeighbourhood[];
    try {
      neighbourhoods = await Promise.all(
        strongestFirst(this.active, this.tally()).map(async (topic) => ({
          topicId: topic.id,
          sources: await context.entityService.nearestToEntity({
            origin: { entityType: "topic", entityId: topic.id },
            types,
            limit: SOURCES_PER_TOPIC,
            visibilityScope: config.extractionVisibility,
          }),
        })),
      );
    } catch (error) {
      // Without embeddings no topic is measured against its sources.
      if (error instanceof SemanticIndexingDisabledError) return;
      throw error;
    }
    for (const { topicId, into } of duplicateTopics(neighbourhoods)) {
      this.signal.throwIfAborted();
      const topic = this.active.find(({ id }) => id === topicId);
      const owner = this.active.find(({ id }) => id === into);
      if (!topic || !owner) continue;
      await this.absorb(topic, owner);
    }
  }

  private async trimToCeiling(): Promise<void> {
    if (!this.allRead() || this.active.length <= this.ceiling()) return;
    this.signal.throwIfAborted();
    // A merge above moves the absorbed topic's votes to the topic it
    // joined, so the weakest topic is judged on a fresh tally.
    const weakest = weakestTopic(this.active, this.tally());
    if (!weakest) return;
    await this.removeTopic(weakest.id);
    await this.trimToCeiling();
  }

  /** Bring in the leading challenger, one description call each. */
  private async admitChallengers(): Promise<void> {
    if (this.calls >= MAX_AI_CALLS) return;
    this.signal.throwIfAborted();
    const choice = this.choose();
    if (!choice) return;
    const description = await this.deps.context.ai.generate(
      {
        templateName: "topics:description",
        representedIdentity: "none",
        prompt: descriptionPrompt(choice.candidate),
      },
      topicDescriptionResponseSchema,
      this.signal,
    );
    this.calls++;
    this.signal.throwIfAborted();
    await this.rescan();
    this.active = await this.readActive();
    this.signal.throwIfAborted();
    if (this.allRead() && this.active.length > this.ceiling()) return;
    if (isSameChoice(this.choose(), choice))
      await this.admit(choice, description.content);
    await this.admitChallengers();
  }

  private async admit(
    { candidate, replace }: TopicChoice,
    content: string,
  ): Promise<void> {
    const { topics, config } = this.deps;
    // Generate before deleting. Once mutations begin, finish this small
    // commit section; an interrupted retry can fill any vacant slot.
    if (replace) {
      await topics.deleteTopic(replace.id);
      this.active = this.active.filter(({ id }) => id !== replace.id);
    }
    await topics.createTopic({
      title: candidate.title,
      content,
      visibility: config.extractionVisibility,
    });
    this.active.push({
      id: scopedDerivedId(candidate.slug, config.extractionVisibility),
      slug: candidate.slug,
      title: candidate.title,
    });
    this.changed++;
  }

  private async voteOn(
    refs: readonly SourceRef[],
  ): Promise<BatchOutcome | null> {
    const { context, config, logger } = this.deps;
    const batch = await loadSources(context, config, refs);
    if (batch.length === 0) return null;
    const titles = votePromptTitles(
      this.active,
      this.earlier,
      this.tally(),
      this.ceiling(),
      config,
    );
    let response: TopicVoteResponse;
    try {
      response = await context.ai.generate(
        {
          templateName: "topics:votes",
          representedIdentity: "none",
          prompt: votePrompt(titles, batch),
        },
        topicVoteResponseSchema,
        this.signal,
      );
    } catch (error) {
      this.signal.throwIfAborted();
      this.calls++;
      logger.warn("Topic vote call failed", {
        sources: batch.map(sourceKey),
        error: getErrorMessage(error),
      });
      return { answered: false, unanswered: batch, error };
    }
    this.calls++;
    this.signal.throwIfAborted();
    const listedTitles = new Set([...titles.current, ...titles.challengers]);
    const answers = attributableAnswers(batch, response.sources);
    const unanswered: BaseEntity[] = [];
    for (const source of batch) {
      const result = answers.get(sourceKey(source));
      if (!result) {
        unanswered.push(source);
        continue;
      }
      this.signal.throwIfAborted();
      await this.checkpoint(
        sourceKey(source),
        normalizeVote(
          source,
          this.promptVersion,
          result,
          listedTitles,
          this.policy(source.entityType).canMint,
          config,
        ),
      );
    }
    return { answered: true, unanswered };
  }

  private async recordFailures(
    unanswered: readonly BaseEntity[],
  ): Promise<void> {
    const { config, logger, stores } = this.deps;
    for (const source of unanswered) {
      this.signal.throwIfAborted();
      const key = sourceKey(source);
      const count = failedAttempts(this.failed, source) + 1;
      if (count >= MAX_SOURCE_ATTEMPTS) {
        logger.warn("Topic votes abstained for a repeatedly failing source", {
          source: key,
        });
        await this.checkpoint(key, {
          contentHash: source.contentHash,
          promptVersion: this.promptVersion,
          visibility: config.extractionVisibility,
          supported: [],
          proposal: null,
        });
      } else {
        const next: SourceFailure = {
          contentHash: source.contentHash,
          attempts: count,
        };
        await stores.failures.set(key, next);
        this.failed.set(key, next);
      }
    }
  }

  private async checkpoint(key: string, vote: TopicVote): Promise<void> {
    const { votes, failures } = this.deps.stores;
    await votes.set(key, vote);
    this.saved.set(key, vote);
    if (this.failed.delete(key)) await failures.delete(key);
  }
}
