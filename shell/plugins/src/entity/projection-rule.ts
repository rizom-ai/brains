import {
  ProjectionJsonObjectSchema,
  ProjectionWriteIntentSchema,
  type BaseEntity,
  type EntityTypeConfig,
  type GetEntityRequest,
  type ListEntitiesRequest,
  type ProjectionOwnedEntityRequest,
  type ProjectionJsonObject,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import type { LoggerContract } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { RuntimeAppInfo } from "../contracts/runtime-app-info";
import type { IEntityAINamespace } from "./ai-types";
import { computeProjectionInputFingerprint } from "./projection-input-fingerprint";

export {
  ProjectionJsonObjectSchema,
  ProjectionJsonValueSchema,
  ProjectionWriteIntentSchema,
  type ProjectionEntityWrite,
  type ProjectionJsonObject,
  type ProjectionJsonValue,
  type ProjectionWriteIntent,
} from "@brains/entity-service";

export interface ProjectionRuleEntitySource {
  readonly kind: "entity";
  readonly types: readonly string[];
  readonly excludeTypes?: readonly string[] | undefined;
}

export interface ProjectionWaveInput {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly revision: string;
  readonly operation: "upsert" | "delete";
  readonly generation?: number | undefined;
}

export interface ProjectionWaveTrigger {
  readonly waveId: string;
  readonly inputs: readonly ProjectionWaveInput[];
}

/**
 * Entity reads available to a projection rule, spelled out structurally.
 *
 * This was a `Pick` of the entity service interface, which cannot cross
 * the published declaration boundary — the generated declarations inline
 * every referenced type, and an inlined runtime service is nominally
 * distinct from the original. The runtime service satisfies this
 * structurally, so it passes itself unchanged.
 */
export interface ProjectionEntityReader {
  getEntity<T extends BaseEntity>(request: GetEntityRequest): Promise<T | null>;
  listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]>;
  getEntityTypes(): string[];
  hasEntityType(type: string): boolean;
  getEntityTypeConfig(type: string): EntityTypeConfig;
  isProjectionOwnedEntity(
    request: ProjectionOwnedEntityRequest,
  ): Promise<boolean>;
}

export interface ProjectionInputContext {
  readonly entities: ProjectionEntityReader;
  readonly resolvePrompt: (
    reference: string,
    fallback: string,
  ) => Promise<string>;
  readonly appInfo: () => Promise<RuntimeAppInfo>;
  readonly identityInput: () => ProjectionJsonObject;
}

export interface ProjectionExecutionContext {
  readonly ai: Pick<
    IEntityAINamespace,
    "query" | "generate" | "generateObject" | "generateImage"
  >;
  readonly logger: LoggerContract;
}

export interface ProjectionRule {
  readonly id: string;
  readonly version: string;
  readonly sources: readonly ProjectionRuleEntitySource[];
  readonly targetType: string;
  readonly sourceChangeBatchDelayMs: number;
  readonly inputSchema: z.ZodType<ProjectionJsonObject>;
  readonly selectInput: (
    trigger: ProjectionWaveTrigger,
    context: ProjectionInputContext,
    signal: AbortSignal,
  ) => Promise<ProjectionJsonObject>;
  readonly fingerprint: (input: ProjectionJsonObject) => string;
  readonly derive: (
    input: ProjectionJsonObject,
    context: ProjectionExecutionContext,
    signal: AbortSignal,
  ) => Promise<readonly ProjectionWriteIntent[]>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export interface ProjectionRuleDefinition<
  TInput extends ProjectionJsonObject = ProjectionJsonObject,
> {
  readonly id: string;
  readonly version: string;
  readonly sources: readonly ProjectionRuleEntitySource[];
  readonly targetType: string;
  readonly sourceChangeBatchDelayMs?: number | undefined;
  readonly inputSchema: z.ZodType<TInput>;
  readonly selectInput: (
    trigger: ProjectionWaveTrigger,
    context: ProjectionInputContext,
    signal: AbortSignal,
  ) => Promise<TInput>;
  readonly derive: (
    input: TInput,
    context: ProjectionExecutionContext,
    signal: AbortSignal,
  ) => Promise<readonly ProjectionWriteIntent[]>;
}

const ProjectionRuleMetadataSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  sources: z.array(
    z.strictObject({
      kind: z.literal("entity"),
      types: z.array(z.string().trim().min(1)).min(1),
      excludeTypes: z.array(z.string().trim().min(1)).optional(),
    }),
  ),
  targetType: z.string().trim().min(1),
  sourceChangeBatchDelayMs: z.number().int().nonnegative().default(0),
});

export function defineProjectionRule<TInput extends ProjectionJsonObject>(
  input: ProjectionRuleDefinition<TInput>,
): Readonly<ProjectionRule> {
  const metadata = ProjectionRuleMetadataSchema.parse({
    id: input.id,
    version: input.version,
    sources: input.sources,
    targetType: input.targetType,
    sourceChangeBatchDelayMs: input.sourceChangeBatchDelayMs,
  });
  if (typeof input.selectInput !== "function") {
    throw new Error(`Projection rule "${metadata.id}" must select input`);
  }
  if (typeof input.derive !== "function") {
    throw new Error(`Projection rule "${metadata.id}" must derive output`);
  }

  const sources = metadata.sources.map((source) => {
    const types = Object.freeze([...source.types]);
    const excludeTypes = source.excludeTypes
      ? Object.freeze([...source.excludeTypes])
      : undefined;
    const frozenSource: ProjectionRuleEntitySource = {
      kind: "entity",
      types,
      ...(excludeTypes ? { excludeTypes } : {}),
    };
    return Object.freeze(frozenSource);
  });

  return Object.freeze({
    id: metadata.id,
    version: metadata.version,
    sources: Object.freeze(sources),
    targetType: metadata.targetType,
    sourceChangeBatchDelayMs: metadata.sourceChangeBatchDelayMs,
    inputSchema: input.inputSchema,
    selectInput: async (
      trigger: ProjectionWaveTrigger,
      context: ProjectionInputContext,
      signal: AbortSignal,
    ): Promise<ProjectionJsonObject> => {
      const selected = await input.selectInput(trigger, context, signal);
      const jsonInput = ProjectionJsonObjectSchema.parse(selected);
      return deepFreeze(input.inputSchema.parse(jsonInput));
    },
    fingerprint: computeProjectionInputFingerprint,
    derive: async (
      selected: ProjectionJsonObject,
      context: ProjectionExecutionContext,
      signal: AbortSignal,
    ): Promise<readonly ProjectionWriteIntent[]> => {
      const parsedInput = input.inputSchema.parse(selected);
      const intents = z
        .array(ProjectionWriteIntentSchema)
        .parse(await input.derive(parsedInput, context, signal));
      for (const intent of intents) {
        const entityType =
          intent.operation === "upsert"
            ? intent.entity.entityType
            : intent.entityType;
        if (entityType !== metadata.targetType) {
          throw new Error(
            `Projection rule "${metadata.id}" cannot write entity type "${entityType}"`,
          );
        }
      }
      return deepFreeze(intents);
    },
  });
}
