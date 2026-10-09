import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  z,
  type EntityEvalContext,
  type ServiceEvalHandler,
} from "@brains/sdk/services";
import type { TopicsPluginConfig } from "../schemas/config";
import { parseTopicBody } from "./topic-body";
import { evaluationTopics } from "./evaluation-topics";
import { runRankedTopicExtraction } from "./ranked-topic-extraction";
import { evaluationCheckpoints } from "./evaluation-checkpoints";

const entityInputSchema = z.object({
  entityType: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type EntityInput = z.output<typeof entityInputSchema>;

const extractInputSchema = entityInputSchema.extend({
  minRelevanceScore: z.number().optional(),
});

const sequentialInputSchema = z.object({
  entities: z.array(entityInputSchema).min(1),
  minRelevanceScore: z.number().optional(),
});

const seedTopicSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  content: z.string(),
});

const rebuildTopicsSchema = z.object({
  existingTopics: z.array(seedTopicSchema).optional(),
  entities: z.array(entityInputSchema),
});

const batchInputSchema = z.object({
  entities: z.array(entityInputSchema),
});

const corpusFixtureSchema = z.object({
  entities: z.array(entityInputSchema.extend({ id: z.string() })).min(1),
});

const corpusAcceptanceSchema = z.object({
  fixture: z.string(),
  minTopicCount: z.number().int().min(0).default(5),
  maxTopicCount: z.number().int().min(0).default(14),
  requiredTitleMatches: z.array(z.string()).default([]),
  forbiddenTitleMatches: z.array(z.string()).default([]),
  forbiddenTitlePairs: z
    .array(z.object({ left: z.string(), right: z.string() }))
    .default([]),
});

type CorpusAcceptanceInput = z.output<typeof corpusAcceptanceSchema>;

interface MintedTopic {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

function getCorpusAcceptanceIssues(
  topicTitles: readonly string[],
  input: CorpusAcceptanceInput,
): string[] {
  const issues: string[] = [];
  if (topicTitles.length < input.minTopicCount) {
    issues.push(`too few topics: ${topicTitles.length}`);
  }
  if (topicTitles.length > input.maxTopicCount) {
    issues.push(`too many topics: ${topicTitles.length}`);
  }

  for (const pattern of input.requiredTitleMatches) {
    const regex = new RegExp(pattern, "i");
    if (!topicTitles.some((title) => regex.test(title))) {
      issues.push(`missing required title match: ${pattern}`);
    }
  }

  for (const pattern of input.forbiddenTitleMatches) {
    const regex = new RegExp(pattern, "i");
    const match = topicTitles.find((title) => regex.test(title));
    if (match) issues.push(`forbidden title matched ${pattern}: ${match}`);
  }

  for (const pair of input.forbiddenTitlePairs) {
    const left = new RegExp(pair.left, "i");
    const right = new RegExp(pair.right, "i");
    if (
      topicTitles.some((title) => left.test(title)) &&
      topicTitles.some((title) => right.test(title))
    ) {
      issues.push(
        `forbidden duplicate pair present: ${pair.left} / ${pair.right}`,
      );
    }
  }

  return issues;
}

/**
 * Seed evaluation fixtures and drive the same ranked extraction as the job.
 * Votes, leases and topic mutations are local to this evaluation.
 */
async function extract(
  context: EntityEvalContext,
  config: TopicsPluginConfig,
  extractionTemplate: string,
  sources: readonly (EntityInput & { readonly id?: string })[],
  seedTopics: readonly z.output<typeof seedTopicSchema>[] = [],
): Promise<MintedTopic[]> {
  await context.fixtures.reset();

  const localTopics = evaluationTopics(seedTopics, config.extractionVisibility);
  await Promise.all(
    sources.map((source, index) =>
      context.fixtures.seed({
        id: source.id ?? `eval-source-${index}`,
        entityType: source.entityType,
        content: source.content,
        metadata: source.metadata ?? {},
      }),
    ),
  );

  const state = evaluationCheckpoints();
  let pending = true;
  for (let pass = 0; pending && pass < 100; pass++) {
    pending = false;
    await runRankedTopicExtraction(
      {
        ...context,
        signal: new AbortController().signal,
        template: (name) =>
          name === "votes" ? extractionTemplate : context.template(name),
        ...localTopics,
        enqueue: async () => {
          pending = true;
        },
        changed: async () => {},
      },
      config,
      state,
    );
  }
  if (pending)
    throw new Error("Topic evaluation did not converge within 100 jobs");
  return (await localTopics.readTopics()).map(({ entity: entry }) => {
    const parsed = parseTopicBody(entry.content);
    return { id: entry.id, title: parsed.title, content: parsed.content };
  });
}

/**
 * Eval handlers for topic extraction.
 *
 * Every handler drives the ranked algorithm that actually runs, without
 * mutating the installed job's durable vote or lease checkpoints.
 */
export function topicEvalHandlers(
  config: TopicsPluginConfig,
  extractionTemplate: string,
): Record<string, ServiceEvalHandler> {
  const handlers: Record<string, ServiceEvalHandler> = {
    extractFromEntity: async (input, context) => {
      const parsed = extractInputSchema.parse(input);
      const topics = await extract(context, config, extractionTemplate, [
        parsed,
      ]);
      return topics.map(({ title, content }) => ({ title, content }));
    },

    extractSequentially: async (input, context) => {
      const parsed = sequentialInputSchema.parse(input);
      const topics = await extract(
        context,
        config,
        extractionTemplate,
        parsed.entities,
      );
      return { totalTopics: topics.length, topics };
    },

    batchExtract: async (input, context) => {
      const parsed = batchInputSchema.parse(input);
      const topics = await extract(
        context,
        config,
        extractionTemplate,
        parsed.entities,
      );
      return { topicCount: topics.length, topics };
    },

    rebuildTopics: async (input, context) => {
      const parsed = rebuildTopicsSchema.parse(input);
      const topics = await extract(
        context,
        config,
        extractionTemplate,
        parsed.entities,
        parsed.existingTopics ?? [],
      );
      return { topicCount: topics.length, topics };
    },

    rebuildCorpusFixture: async (input, context) => {
      const parsed = corpusAcceptanceSchema.parse(input);
      const fixture = corpusFixtureSchema.parse(
        JSON.parse(
          await readFile(resolve(process.cwd(), parsed.fixture), "utf8"),
        ),
      );
      const topics = await extract(
        context,
        config,
        extractionTemplate,
        fixture.entities,
      );
      const topicTitles = topics.map(({ title }) => title);
      const issues = getCorpusAcceptanceIssues(topicTitles, parsed);

      return {
        sourceCount: fixture.entities.length,
        topicCount: topics.length,
        topicTitles,
        issueCount: issues.length,
        issues,
        topics,
      };
    },
  };
  return handlers;
}
