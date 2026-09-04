import {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

export const summaryTimeRangeSchema: z.ZodObject<{
  start: z.ZodString;
  end: z.ZodString;
}> = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type SummaryTimeRange = z.output<typeof summaryTimeRangeSchema>;

export const summaryEntrySchema: z.ZodObject<{
  title: z.ZodString;
  summary: z.ZodString;
  timeRange: typeof summaryTimeRangeSchema;
  sourceMessageCount: z.ZodNumber;
  keyPoints: z.ZodArray<z.ZodString>;
}> = z.object({
  title: z.string().min(1).describe("Brief topic or phase title"),
  summary: z.string().min(1).describe("Grounded prose summary"),
  timeRange: summaryTimeRangeSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
});

export type SummaryEntry = z.output<typeof summaryEntrySchema>;

export const summaryBodySchema: z.ZodObject<{
  entries: z.ZodArray<typeof summaryEntrySchema>;
}> = z.object({
  entries: z.array(summaryEntrySchema),
});

export type SummaryBody = z.output<typeof summaryBodySchema>;

export const summaryParticipantSchema: z.ZodObject<{
  identity: typeof actorRefSchema;
  identityAliases: z.ZodOptional<z.ZodArray<typeof actorRefSchema>>;
  displayName: z.ZodOptional<z.ZodString>;
  roles: z.ZodArray<
    z.ZodEnum<{ user: "user"; assistant: "assistant"; system: "system" }>
  >;
}> = z.object({
  identity: actorRefSchema,
  identityAliases: z.array(actorRefSchema).optional(),
  displayName: z.string().optional(),
  roles: z.array(z.enum(["user", "assistant", "system"])).min(1),
});

export type SummaryParticipant = z.output<typeof summaryParticipantSchema>;

type SummaryMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  timeRange: z.ZodOptional<typeof summaryTimeRangeSchema>;
  messageCount: z.ZodNumber;
  entryCount: z.ZodNumber;
  participants: z.ZodOptional<z.ZodArray<typeof summaryParticipantSchema>>;
  sourceHash: z.ZodString;
  projectionVersion: z.ZodNumber;
}>;

export const summaryMetadataSchema: SummaryMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

const summaryParticipantParserSchema: z.ZodPreprocess<
  typeof summaryParticipantSchema
> = z.preprocess(
  (value) => normalizeLegacySummaryParticipant(value),
  summaryParticipantSchema,
);

function normalizeLegacySummaryParticipant(value: unknown): unknown {
  if (!isRecord(value) || "identity" in value) return value;
  const actorId = value["actorId"];
  const roles = value["roles"];
  if (typeof actorId !== "string" || !Array.isArray(roles)) return value;
  const canonicalId = value["canonicalId"];
  const role = roles.includes("assistant") ? "assistant" : "user";
  const sourceActorIds = Array.isArray(value["sourceActorIds"])
    ? value["sourceActorIds"].filter(
        (candidate): candidate is string => typeof candidate === "string",
      )
    : [];
  const identityAliases = Array.from(
    new Map(
      [actorId, ...sourceActorIds].map((legacyActorId) => {
        const alias = actorRefFromLegacy({
          actorId: legacyActorId,
          interfaceType: sourceFromLegacyActorId(legacyActorId),
          role,
        });
        return [actorRefKey(alias), alias];
      }),
    ).values(),
  );
  return {
    identity: actorRefFromLegacy({
      actorId,
      interfaceType: sourceFromLegacyActorId(actorId),
      role,
      ...(typeof canonicalId === "string" ? { canonicalId } : {}),
    }),
    ...(identityAliases.length > 0 ? { identityAliases } : {}),
    ...(typeof value["displayName"] === "string"
      ? { displayName: value["displayName"] }
      : {}),
    roles,
  };
}

function sourceFromLegacyActorId(actorId: string): string {
  const separator = actorId.indexOf(":");
  return separator > 0 ? actorId.slice(0, separator) : "legacy";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const summaryEntityMetadataParserSchema: z.ZodObject<
  Omit<SummaryMetadataSchema["shape"], "participants"> & {
    participants: z.ZodOptional<
      z.ZodArray<typeof summaryParticipantParserSchema>
    >;
  }
> = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantParserSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

/** Summary entity metadata, as parsed from stored (possibly legacy) records. */
export type SummaryMetadata = z.output<
  typeof summaryEntityMetadataParserSchema
>;

export const summarySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"summary">;
    metadata: typeof summaryEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("summary"),
  metadata: summaryEntityMetadataParserSchema,
});

export type SummaryEntity = z.output<typeof summarySchema>;
