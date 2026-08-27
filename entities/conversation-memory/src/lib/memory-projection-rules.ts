import {
  PROJECTION_ABSTAINED,
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  parseMarkdown,
  z,
  type ProjectionAbstention,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionJsonObject,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import { composeMemoryMarkdown } from "./memory-markdown";
import {
  parseMemoryProjectionEnvelope,
  type ProjectedMemoryWrite,
} from "./memory-projection-envelope";
import type { SummaryConfig } from "../schemas/summary-config";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../schemas/conversation-memory";
import type { SummaryEntity } from "../schemas/summary";

export const DECISION_PROJECTION_ID = "summary-decision-derivation";
export const ACTION_ITEM_PROJECTION_ID = "summary-action-item-derivation";

interface ExistingTarget extends ProjectionJsonObject {
  id: string;
  status: string | null;
}

interface MemoryPartition extends ProjectionJsonObject {
  summaryId: string;
  desired: ProjectedMemoryWrite[];
  existing: ExistingTarget[];
}

export interface ManagedMemoryProjectionInput extends ProjectionJsonObject {
  partitions: MemoryPartition[];
}

const projectedEntitySchema: z.ZodType<ProjectedMemoryWrite> = z.strictObject({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  metadata: ProjectionJsonObjectSchema,
  visibility: z.enum(["public", "shared", "restricted"]),
});

const existingTargetSchema: z.ZodType<ExistingTarget> = z.strictObject({
  id: z.string(),
  status: z.string().nullable(),
});

const partitionSchema: z.ZodType<MemoryPartition> = z.strictObject({
  summaryId: z.string(),
  desired: z.array(projectedEntitySchema),
  existing: z.array(existingTargetSchema),
});

const managedMemoryProjectionInputSchema: z.ZodType<ManagedMemoryProjectionInput> =
  z.object({
    partitions: z.array(partitionSchema),
  });

type MemoryTargetType =
  typeof DECISION_ENTITY_TYPE | typeof ACTION_ITEM_ENTITY_TYPE;

interface TargetDefinition {
  readonly type: MemoryTargetType;
  readonly ruleId: string;
}

function validLifecycleStatus(
  targetType: MemoryTargetType,
  status: string | null,
): string | null {
  if (targetType === DECISION_ENTITY_TYPE) {
    return status === "active" || status === "superseded" ? status : null;
  }
  return status === "open" || status === "done" || status === "dropped"
    ? status
    : null;
}

async function selectManagedMemoryInput(
  trigger: Parameters<ProjectionRule["selectInput"]>[0],
  context: ProjectionInputContext,
  config: SummaryConfig,
  target: TargetDefinition,
): Promise<ManagedMemoryProjectionInput> {
  const changedSummaryIds = [
    ...new Set(
      trigger.inputs
        .filter(
          (input) =>
            input.sourceType === SUMMARY_ENTITY_TYPE &&
            input.operation === "upsert",
        )
        .map(({ sourceId }) => sourceId),
    ),
  ];

  const partitions = await Promise.all(
    changedSummaryIds.map(async (summaryId) => {
      const summary = await context.entities.getEntity<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        id: summaryId,
        visibilityScope: config.memoryVisibility,
      });
      if (summary?.visibility !== config.memoryVisibility) return null;
      const envelope = parseMemoryProjectionEnvelope(summary.content);
      if (!envelope) return null;

      const desired = (
        target.type === DECISION_ENTITY_TYPE
          ? envelope.decisions
          : envelope.actionItems
      ).filter((entity) => entity.entityType === target.type);
      const existing = await context.entities.listEntities<
        DecisionEntity | ActionItemEntity
      >({
        entityType: target.type,
        options: {
          filter: {
            metadata: { sourceSummaryId: summaryId },
            visibilityScope: config.memoryVisibility,
          },
        },
      });

      return {
        summaryId,
        desired,
        existing: existing
          .filter(
            (entity) =>
              entity.visibility === config.memoryVisibility &&
              entity.metadata.sourceSummaryId === summaryId,
          )
          .map((entity) => ({
            id: entity.id,
            status:
              typeof entity.metadata.status === "string"
                ? entity.metadata.status
                : null,
          })),
      };
    }),
  );

  return {
    partitions: partitions.filter(
      (partition): partition is NonNullable<typeof partition> =>
        partition !== null,
    ),
  };
}

function withPreservedStatus(
  desired: ProjectedMemoryWrite,
  status: string | null,
): ProjectedMemoryWrite {
  if (!status) return desired;
  const metadata = ProjectionJsonObjectSchema.parse({
    ...desired.metadata,
    status,
  });
  return {
    ...desired,
    content: composeMemoryMarkdown(
      parseMarkdown(desired.content).content,
      metadata,
    ),
    metadata,
  };
}

function deriveManagedMemory(
  input: ManagedMemoryProjectionInput,
  _context: ProjectionExecutionContext,
  _signal: AbortSignal,
  target: TargetDefinition,
): readonly ProjectionWriteIntent[] | ProjectionAbstention {
  if (input.partitions.length === 0) return PROJECTION_ABSTAINED;

  return input.partitions.flatMap((partition): ProjectionWriteIntent[] => {
    const existing = new Map(
      partition.existing.map((entity) => [entity.id, entity]),
    );
    const desiredIds = new Set(partition.desired.map(({ id }) => id));
    const upserts = partition.desired.map((entity): ProjectionWriteIntent => {
      const status = validLifecycleStatus(
        target.type,
        existing.get(entity.id)?.status ?? null,
      );
      return {
        operation: "upsert",
        entity: withPreservedStatus(entity, status),
      };
    });
    const deletes = partition.existing
      .filter(({ id }) => !desiredIds.has(id))
      .map(({ id }): ProjectionWriteIntent => ({
        operation: "delete",
        entityType: target.type,
        id,
      }));
    return [...upserts, ...deletes];
  });
}

function createManagedMemoryRule(
  config: SummaryConfig,
  target: TargetDefinition,
): ProjectionRule {
  return defineProjectionRule({
    id: target.ruleId,
    version: String(config.projectionVersion),
    sources: [{ kind: "entity", types: [SUMMARY_ENTITY_TYPE] }],
    targetType: target.type,
    targets: { authority: "managed" },
    inputSchema: managedMemoryProjectionInputSchema,
    selectInput: async (trigger, context) =>
      selectManagedMemoryInput(trigger, context, config, target),
    derive: async (input, context, signal) =>
      deriveManagedMemory(input, context, signal, target),
  });
}

export function createDecisionProjectionRule(
  config: SummaryConfig,
): ProjectionRule {
  return createManagedMemoryRule(config, {
    type: DECISION_ENTITY_TYPE,
    ruleId: DECISION_PROJECTION_ID,
  });
}

export function createActionItemProjectionRule(
  config: SummaryConfig,
): ProjectionRule {
  return createManagedMemoryRule(config, {
    type: ACTION_ITEM_ENTITY_TYPE,
    ruleId: ACTION_ITEM_PROJECTION_ID,
  });
}
