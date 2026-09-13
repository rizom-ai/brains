import { z } from "@brains/utils/zod";
import { encodeEntityIdPath, entityIdPathSchema } from "@brains/entity-service";
import { MAX_GENERATION_TARGETS } from "./generation-limits";
import {
  contentGenerationSkipReasons,
  destinationKey,
} from "./generation-contracts";

/**
 * Author-facing destination: the structured path plus the stored entity ID it
 * encodes to, so authors read output back with existing entity readers and
 * never reconstruct an ID or touch the separator themselves.
 */
const destinationSchema: z.ZodObject<
  {
    entityType: z.ZodString;
    idPath: typeof entityIdPathSchema;
    entityId: z.ZodString;
  },
  z.core.$strict
> = z.strictObject({
  entityType: z.string().min(1),
  idPath: entityIdPathSchema,
  entityId: z.string().min(1),
});
const common: { destination: typeof destinationSchema; template: z.ZodString } =
  { destination: destinationSchema, template: z.string().min(1) };
type CommonShape = typeof common;
const plannedSchema: z.ZodObject<
  CommonShape & { status: z.ZodLiteral<"planned"> },
  z.core.$strict
> = z.strictObject({ ...common, status: z.literal("planned") });
const queuedSchema: z.ZodObject<
  CommonShape & { status: z.ZodLiteral<"queued">; jobId: z.ZodString },
  z.core.$strict
> = z.strictObject({
  ...common,
  status: z.literal("queued"),
  jobId: z.string().min(1),
});
const skippedSchema: z.ZodObject<
  CommonShape & {
    status: z.ZodLiteral<"skipped">;
    reason: z.ZodEnum<{
      "content-exists": "content-exists";
      "template-not-found": "template-not-found";
      "template-cannot-generate": "template-cannot-generate";
    }>;
  },
  z.core.$strict
> = z.strictObject({
  ...common,
  status: z.literal("skipped"),
  reason: z.enum(contentGenerationSkipReasons),
});
const itemSchema: z.ZodDiscriminatedUnion<
  [typeof plannedSchema, typeof queuedSchema, typeof skippedSchema]
> = z.discriminatedUnion("status", [
  plannedSchema,
  queuedSchema,
  skippedSchema,
]);

/** Author-facing admission decisions, never output or completion evidence. */
export const contentGenerationResultSchema: z.ZodObject<
  {
    items: z.ZodArray<typeof itemSchema>;
    totalTargets: z.ZodNumber;
    plannedTargets: z.ZodNumber;
    queuedTargets: z.ZodNumber;
    skippedTargets: z.ZodNumber;
    batchId: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z
  .strictObject({
    items: z.array(itemSchema).max(MAX_GENERATION_TARGETS),
    totalTargets: z.number().int().nonnegative(),
    plannedTargets: z.number().int().nonnegative(),
    queuedTargets: z.number().int().nonnegative(),
    skippedTargets: z.number().int().nonnegative(),
    batchId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const planned = value.items.filter((item) => item.status === "planned");
    const queued = value.items.filter((item) => item.status === "queued");
    const skipped = value.items.filter((item) => item.status === "skipped");
    const destinations = value.items.map((item) =>
      destinationKey(item.destination),
    );
    if (
      value.items.some(
        (item) =>
          encodeEntityIdPath(item.destination.idPath) !==
          item.destination.entityId,
      ) ||
      value.totalTargets !== value.items.length ||
      value.plannedTargets !== planned.length + queued.length ||
      value.queuedTargets !== queued.length ||
      value.skippedTargets !== skipped.length ||
      queued.length > 0 !== (value.batchId !== undefined) ||
      (planned.length > 0 && queued.length > 0) ||
      new Set(queued.map((item) => item.jobId)).size !== queued.length ||
      new Set(destinations).size !== destinations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid generation admission counts or references",
      });
    }
  });
export type ContentGenerationResult = z.output<
  typeof contentGenerationResultSchema
>;
export type ContentGenerationResultItem = z.output<typeof itemSchema>;
