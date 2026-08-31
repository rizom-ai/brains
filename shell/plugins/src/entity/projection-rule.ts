import {
  ProjectionJsonObjectSchema,
  ProjectionWriteIntentSchema,
  type BaseEntity,
  type EntityTypeConfig,
  type GetEntityRequest,
  type GetEntitiesRequest,
  type ContentVisibility,
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
import type { EntityConversationReader } from "../job/job-context-contract";

export {
  ProjectionJsonObjectSchema,
  ProjectionJsonValueSchema,
  ProjectionWriteIntentSchema,
  type ProjectionEntityWrite,
  type ProjectionJsonObject,
  type ProjectionJsonValue,
  type ProjectionWriteIntent,
} from "@brains/entity-service";

/**
 * The source type a conversation change is marked dirty under.
 *
 * Conversations are not entities and live in their own database, so nothing
 * marks them dirty inside the write that changed them the way an entity
 * does. The runtime polls them and records changes under this name, which
 * puts them in the same vocabulary every source matcher already speaks.
 */
export const CONVERSATION_SOURCE_TYPE = "conversation";

/**
 * What a derivation returns when it did not derive.
 *
 * An empty array is a complete answer: nothing should exist. Abstaining is a
 * different claim — there was nothing to derive *from*, so the rule has no
 * opinion about what should exist and the runtime must leave its targets
 * alone. An exclusive rule cannot tell those apart from `[]`, and reading
 * one as the other deletes a corpus: skill derives nothing when no topics
 * exist, which is normal during initial sync.
 */
export const PROJECTION_ABSTAINED: { readonly kind: "projection-abstained" } =
  Object.freeze({ kind: "projection-abstained" as const });

export type ProjectionAbstention = typeof PROJECTION_ABSTAINED;

export interface ProjectionRuleEntitySource {
  readonly kind: "entity" | "conversation";
  readonly types: readonly string[];
  readonly excludeTypes?: readonly string[] | undefined;
}

/**
 * What an author declares. A conversation source names no types — there is
 * only one thing it can mean, and spelling it out invites getting it wrong.
 */
export type ProjectionRuleSourceInput =
  | {
      readonly kind: "entity";
      readonly types: readonly string[];
      readonly excludeTypes?: readonly string[] | undefined;
    }
  | { readonly kind: "conversation" };

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
  getEntities(request: GetEntitiesRequest): Promise<BaseEntity[]>;
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
  /** The brain's configured conversation spaces. */
  readonly spaces: readonly string[];
  /**
   * What was said, for a rule that derives from it.
   *
   * A conversation source tells a rule *that* a conversation changed; this
   * is how it reads one. Narrow on purpose: a derivation needs the
   * conversation and its messages, not the ability to write either.
   */
  readonly conversations: EntityConversationReader;
  readonly resolvePrompt: (
    reference: string,
    fallback: string,
  ) => Promise<string>;
  readonly appInfo: () => Promise<RuntimeAppInfo>;
  readonly identityInput: () => ProjectionJsonObject;
}

/**
 * Whether a rule owns the entities it derives, or only adds to them.
 *
 * `exclusive` means the latest derivation is the whole truth: anything of
 * this target type within the declared visibility that the derivation no
 * longer mentions is removed by the runtime. `additive` means the rule
 * writes and never removes. `managed` means the domain explicitly reconciles
 * a partition narrower than the runtime's visibility-wide scope.
 *
 * Declared rather than implemented, because both mistakes are silent. A rule
 * that should reconcile and does not accumulates orphans that look real; one
 * that reconciles against the wrong scope deletes entities it never owned,
 * which is precisely what `series-projection` did to `shared` series until
 * it was caught. Visibility is required on `exclusive` so the scope is a
 * decision the author makes rather than one they inherit by omission.
 */
export type ProjectionTargetAuthority =
  | { readonly authority: "additive" }
  | { readonly authority: "managed" }
  | {
      readonly authority: "exclusive";
      readonly visibility: ContentVisibility;
    };

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
  readonly targets: ProjectionTargetAuthority;
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
  ) => Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention>;
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
  readonly sources: readonly ProjectionRuleSourceInput[];
  readonly targetType: string;
  readonly targets: ProjectionTargetAuthority;
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
  ) => Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention>;
}

const ProjectionRuleMetadataSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  sources: z.array(
    z.union([
      z.strictObject({
        kind: z.literal("entity"),
        types: z.array(z.string().trim().min(1)).min(1),
        excludeTypes: z.array(z.string().trim().min(1)).optional(),
      }),
      // Normalized to the shape every downstream matcher reads, so a
      // conversation source needs no special case anywhere but validation.
      z.strictObject({ kind: z.literal("conversation") }).transform(() => ({
        kind: "conversation" as const,
        types: [CONVERSATION_SOURCE_TYPE],
      })),
    ]),
  ),
  targetType: z.string().trim().min(1),
  targets: z.discriminatedUnion("authority", [
    z.strictObject({ authority: z.literal("additive") }),
    z.strictObject({ authority: z.literal("managed") }),
    z.strictObject({
      authority: z.literal("exclusive"),
      visibility: z.enum(["public", "shared", "restricted"]),
    }),
  ]),
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
    targets: input.targets,
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
    const excludeTypes =
      "excludeTypes" in source && source.excludeTypes
        ? Object.freeze([...source.excludeTypes])
        : undefined;
    const frozenSource: ProjectionRuleEntitySource = {
      kind: source.kind,
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
    targets: Object.freeze(metadata.targets),
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
    ): Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention> => {
      const parsedInput = input.inputSchema.parse(selected);
      const derived = await input.derive(parsedInput, context, signal);
      if (derived === PROJECTION_ABSTAINED) return PROJECTION_ABSTAINED;
      const intents = z.array(ProjectionWriteIntentSchema).parse(derived);
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
        if (
          metadata.targets.authority === "additive" &&
          intent.operation === "delete"
        ) {
          throw new Error(
            `Additive projection rule "${metadata.id}" cannot delete targets`,
          );
        }
      }
      return deepFreeze(intents);
    },
  });
}
