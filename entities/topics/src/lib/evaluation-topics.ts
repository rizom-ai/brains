import { SdkError } from "@brains/sdk/services";
import type { BaseEntity, ContentVisibility } from "@brains/sdk/entities";
import { computeContentHash } from "@brains/utils/hash";
import { createTopicBody } from "./topic-body";
import {
  sourceRevision,
  type ExtractionContext,
} from "./ranked-topic-extraction";

/** Ranked evaluation mutates only these local topics, never live authored topics. */
export function evaluationTopics(
  seeds: readonly { id?: string | undefined; title: string; content: string }[],
  visibility: ContentVisibility,
): Pick<ExtractionContext, "readTopics" | "createTopic" | "deleteTopic"> {
  const topics = new Map<string, BaseEntity>();
  const insert = ({
    id,
    title,
    content,
    visibility,
  }: Parameters<ExtractionContext["createTopic"]>[0]): void => {
    if (topics.has(id)) throw new SdkError("conflict");
    const body = createTopicBody({ title, content });
    const now = new Date().toISOString();
    topics.set(id, {
      id,
      entityType: "topic",
      content: body,
      contentHash: computeContentHash(body),
      metadata: {},
      visibility,
      created: now,
      updated: now,
    });
  };
  seeds.forEach((seed, index) =>
    insert({ ...seed, id: seed.id ?? `seed-topic-${index}`, visibility }),
  );
  return {
    readTopics: () =>
      Promise.resolve(
        [...topics.values()].map((entity) => ({
          entity: structuredClone(entity),
          version: sourceRevision(entity),
        })),
      ),
    createTopic: async (input): Promise<void> => {
      insert(input);
    },
    deleteTopic: async (id, version): Promise<void> => {
      const entity = topics.get(id);
      if (!entity || sourceRevision(entity) !== version)
        throw new SdkError("conflict");
      topics.delete(id);
    },
  };
}
