import { SdkError } from "@brains/contracts";
import type {
  EntityAccess,
  EntityReader,
} from "../entity/entity-access-contract";
import { definitionEntitySchema } from "../entity/entity-schema";
import type { JobEntityAccess } from "../job/job-context-contract";
import type { BaseEntity, EntityInput } from "@brains/entity-service";
import type {
  EntityDefinitionShape,
  EntityWriteInput,
} from "../entity/entity-shape";

function writeInput<TDefinition extends EntityDefinitionShape>(
  definition: TDefinition,
  input: Omit<EntityWriteInput<TDefinition>, "id"> & {
    readonly id?: string;
    readonly created?: string;
    readonly updated?: string;
  },
): EntityInput<BaseEntity> {
  return {
    entityType: definition.type,
    content: input.content,
    metadata: input.metadata,
    ...(input.id === undefined ? {} : { id: input.id }),
    ...(input.created === undefined ? {} : { created: input.created }),
    ...(input.updated === undefined ? {} : { updated: input.updated }),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
  };
}

/** One adapter over the existing ownership/visibility-enforcing runtime access. */
export function createAuthoringEntityReader(
  native: JobEntityAccess,
): EntityReader {
  return Object.freeze({
    get: native.get.bind(native),
    list: (definition, options) =>
      native.listEntities(
        { entityType: definition.type, ...(options ? { options } : {}) },
        definitionEntitySchema(definition),
      ),
    search: (definition, query, options) =>
      native.search(
        { query, options: { ...options, types: [definition.type] } },
        definitionEntitySchema(definition),
      ),
    getEntity: native.getEntity.bind(native),
    listEntities: native.listEntities.bind(native),
    getEntityTypes: native.getEntityTypes.bind(native),
    getEntityCounts: native.getEntityCounts.bind(native),
    count: native.count.bind(native),
  } satisfies EntityReader);
}

export function createAuthoringEntityAccess(
  native: JobEntityAccess,
): EntityAccess {
  return Object.freeze({
    ...createAuthoringEntityReader(native),
    create: async (definition, input): Promise<{ id: string }> => {
      const result = await native.create(writeInput(definition, input));
      return { id: result.entityId };
    },
    update: async (definition, entity): Promise<{ id: string }> => {
      if (entity.entityType !== definition.type) {
        throw new SdkError("invalid_input", {
          message: "The entity does not match its definition",
        });
      }
      const result = await native.update({
        id: entity.id,
        entityType: definition.type,
        content: entity.content,
        metadata: entity.metadata,
        visibility: entity.visibility,
        contentHash: entity.contentHash,
        created: entity.created,
        updated: entity.updated,
      });
      return { id: result.entityId };
    },
    delete: (definition, id) => native.delete(definition.type, id),
    createPending: async (
      definition,
      input,
    ): Promise<{ id: string; created: boolean }> => {
      const result = await native.createPending({
        ...writeInput(definition, input),
        id: input.id,
      });
      return { id: result.entityId, created: result.created };
    },
    saveProcessed: async (
      definition,
      input,
      options,
    ): Promise<{ id: string }> => {
      const result = await native.saveProcessed(
        { ...writeInput(definition, input), id: input.id },
        options,
      );
      return { id: result.entityId };
    },
  } satisfies EntityAccess);
}
