import { SdkError } from "@brains/sdk/services";
import type {
  BaseEntity,
  ContentVisibility,
  EntityAccess,
  EntityOf,
  OwnedEntityEdit,
} from "@brains/sdk/entities";
import { topic } from "../topic-entity";
import { createTopicBody } from "./topic-body";

export interface TopicAccess {
  createTopic(input: {
    id: string;
    title: string;
    content: string;
    visibility: ContentVisibility;
  }): Promise<void>;
  readTopics(): Promise<
    readonly {
      readonly entity: Readonly<BaseEntity>;
      readonly version: string;
    }[]
  >;
  deleteTopic(id: string, revision: string): Promise<void>;
}

/** Each job retains only host-issued snapshots from its most recent selection. */
export function ownedTopics(
  entities: EntityAccess,
  visibilityScope: ContentVisibility,
): TopicAccess {
  const edits = new Map<string, OwnedEntityEdit<EntityOf<typeof topic>>>();
  return {
    readTopics: async (): ReturnType<TopicAccess["readTopics"]> => {
      edits.clear();
      for (const entry of await entities.list(topic, {
        filter: { visibilityScope },
      })) {
        const edit = await entities.mutations.read(topic, entry.id, {
          visibilityScope,
        });
        if (edit?.entity.visibility === visibilityScope)
          edits.set(entry.id, edit);
      }
      return [...edits.values()];
    },
    createTopic: async ({ title, content, ...input }): Promise<void> => {
      await entities.create(topic, {
        ...input,
        content: createTopicBody({ title, content }),
        metadata: {},
      });
    },
    deleteTopic: async (id, revision): Promise<void> => {
      const edit = edits.get(id);
      if (edit?.version !== revision) throw new SdkError("conflict");
      await entities.mutations.remove(topic, edit);
      edits.delete(id);
    },
  };
}
