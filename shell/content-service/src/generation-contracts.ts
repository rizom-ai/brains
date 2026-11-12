import { jsonObjectSchema, type JsonObject } from "@brains/contracts";
import {
  canonicalContentVisibilitySchema,
  encodeEntityIdPath,
  entityIdPathSchema,
  type EntityIdPath,
  type EntityIdPathInput,
  type ContentVisibility,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  assertGenerationJsonLimits,
  assertGenerationRequestLimits,
  generationLimitPreprocessor,
} from "./generation-limits";
import type { Caller } from "./caller-authority";
import { generationAuthoritySchema } from "./generation-authorization";
import { generationContextSchema } from "./generation-context";

export const durableGenerationContextSchema: ReturnType<
  typeof generationContextSchema.extend<{
    data: z.ZodOptional<typeof jsonObjectSchema>;
  }>
> = generationContextSchema.extend({
  data: jsonObjectSchema.optional(),
});
export type DurableGenerationContext = z.output<
  typeof durableGenerationContextSchema
>;

export const contentGenerationDestinationSchema: z.ZodObject<{
  entityType: z.ZodString;
  idPath: typeof entityIdPathSchema;
  metadata: typeof jsonObjectSchema;
  visibility: z.ZodOptional<typeof canonicalContentVisibilitySchema>;
}> = z.object({
  entityType: z.string().min(1),
  idPath: entityIdPathSchema,
  metadata: jsonObjectSchema,
  visibility: canonicalContentVisibilitySchema.optional(),
});
export type ContentGenerationDestination = z.output<
  typeof contentGenerationDestinationSchema
>;

/** A destination as a caller states it: the path is not validated yet. */
export interface ContentGenerationDestinationInput {
  entityType: string;
  idPath: EntityIdPathInput;
  metadata: JsonObject;
  visibility?: ContentVisibility | undefined;
}

export const contentGenerationTargetSchema: z.ZodObject<{
  templateName: z.ZodString;
  context: z.ZodDefault<typeof durableGenerationContextSchema>;
  destination: typeof contentGenerationDestinationSchema;
}> = z.object({
  templateName: z.string().min(1),
  context: durableGenerationContextSchema.default(() => ({})),
  destination: contentGenerationDestinationSchema,
});
export type ContentGenerationTarget = z.output<
  typeof contentGenerationTargetSchema
>;

export interface ContentGenerationTargetInput {
  templateName: string;
  context?: DurableGenerationContext;
  destination: ContentGenerationDestinationInput;
}

export const contentGenerationOptionsSchema: z.ZodObject<{
  dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  dryRun: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});
export type ContentGenerationOptions = z.input<
  typeof contentGenerationOptionsSchema
>;
export type ParsedContentGenerationOptions = z.output<
  typeof contentGenerationOptionsSchema
>;

export interface ContentGenerationRequestInput {
  caller: Caller;
  targets: ContentGenerationTargetInput[];
  options?: ContentGenerationOptions;
  /** Template names are local to this plugin and scoped by the runtime. */
  pluginId?: string;
}

/** Owns the admission limits: the preprocessor rejects oversized or cyclic input before Zod recurses. */
export const contentGenerationRequestSchema: z.ZodPreprocess<
  z.ZodObject<{
    targets: z.ZodArray<typeof contentGenerationTargetSchema>;
    options: z.ZodDefault<typeof contentGenerationOptionsSchema>;
  }>
> = z.preprocess(
  generationLimitPreprocessor(assertGenerationRequestLimits),
  z.object({
    targets: z.array(contentGenerationTargetSchema),
    options: contentGenerationOptionsSchema.default(() => ({
      dryRun: false,
      force: false,
    })),
  }),
);

export const persistedContentGenerationDestinationSchema: z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  metadata: typeof jsonObjectSchema;
  visibility: typeof canonicalContentVisibilitySchema;
}> = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  metadata: jsonObjectSchema,
  visibility: canonicalContentVisibilitySchema,
});
export type PersistedContentGenerationDestination = z.output<
  typeof persistedContentGenerationDestinationSchema
>;

/** Owns the durable payload limits for every job the worker accepts. */
export const contentGenerationJobDataSchema: z.ZodPreprocess<
  z.ZodObject<{
    authority: typeof generationAuthoritySchema;
    templateName: z.ZodString;
    context: typeof durableGenerationContextSchema;
    destination: typeof persistedContentGenerationDestinationSchema;
    expectedRevision: z.ZodNullable<z.ZodString>;
  }>
> = z.preprocess(
  generationLimitPreprocessor(assertGenerationJsonLimits),
  z.object({
    authority: generationAuthoritySchema,
    templateName: z.string().min(1, "Template name is required"),
    context: durableGenerationContextSchema,
    destination: persistedContentGenerationDestinationSchema,
    expectedRevision: z.string().min(1).nullable(),
  }),
);
export type ContentGenerationJobData = z.output<
  typeof contentGenerationJobDataSchema
>;

export const contentGenerationSkipReasons = [
  "content-exists",
  "template-not-found",
  "template-cannot-generate",
] as const;
export type ContentGenerationSkipReason =
  (typeof contentGenerationSkipReasons)[number];

/** `index` is the target's position in the request, so results keep its order. */
export interface PlannedContentGeneration {
  readonly index: number;
  readonly target: ContentGenerationTarget;
  readonly entityId: string;
  readonly jobData: ContentGenerationJobData;
}

export interface SkippedContentGeneration {
  readonly index: number;
  readonly target: ContentGenerationTarget;
  readonly entityId: string;
  readonly reason: ContentGenerationSkipReason;
}

export interface ContentGenerationPlan {
  readonly planned: readonly PlannedContentGeneration[];
  readonly skipped: readonly SkippedContentGeneration[];
  readonly totalTargets: number;
}

export type ContentGenerationItemStatus = "planned" | "queued" | "skipped";

interface ContentGenerationItemBase {
  readonly destination: {
    readonly entityType: string;
    readonly idPath: EntityIdPath;
    readonly entityId: string;
  };
  readonly templateName: string;
}

/** One admission decision per requested target, in request order. */
export type ContentGenerationItemResult =
  | (ContentGenerationItemBase & { readonly status: "planned" })
  | (ContentGenerationItemBase & {
      readonly status: "queued";
      readonly jobId: string;
    })
  | (ContentGenerationItemBase & {
      readonly status: "skipped";
      readonly reason: ContentGenerationSkipReason;
    });

export interface ContentGenerationBatchResult {
  readonly items: readonly ContentGenerationItemResult[];
  readonly totalTargets: number;
  readonly plannedTargets: number;
  readonly queuedTargets: number;
  readonly skippedTargets: number;
  readonly batchId?: string;
}

/** The single notion of "same destination", for duplicate checks and messages. */
export function destinationKey(destination: {
  entityType: string;
  idPath: EntityIdPathInput;
}): string {
  return `${destination.entityType}/${encodeEntityIdPath(destination.idPath)}`;
}
