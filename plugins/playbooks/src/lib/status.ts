import { ActionsCardSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  playbookAudienceSchema,
  playbookStateSchema,
  playbookStatusSchema,
  playbookTransitionSchema,
} from "../entity";
import { playbookRunSchema } from "../run-store";
import { lifecycleConfigSchema } from "./lifecycle-starters";

type StrictObjectSchema<Shape extends z.ZodRawShape> = z.ZodObject<
  Shape,
  z.core.$strict
>;

const stateSummarySchema: StrictObjectSchema<{
  id: z.ZodString;
  title: z.ZodString;
}> = z.object({ id: z.string().min(1), title: z.string().min(1) }).strict();

/** A definition reference, not stored Markdown or the complete workflow graph. */
export const playbookSummarySchema: StrictObjectSchema<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"playbook">;
  title: z.ZodString;
  status: typeof playbookStatusSchema;
  audience: typeof playbookAudienceSchema;
  version: z.ZodString;
  initialState: z.ZodOptional<typeof stateSummarySchema>;
}> = z
  .object({
    id: z.string().min(1),
    entityType: z.literal("playbook"),
    title: z.string().min(1),
    status: playbookStatusSchema,
    audience: playbookAudienceSchema,
    version: z.string().min(1),
    initialState: stateSummarySchema.optional(),
  })
  .strict();

export type PlaybookSummary = z.output<typeof playbookSummarySchema>;

/** Shared result of status, start, and send-event; full source stays in the engine. */
export const playbookStatusResponseSchema: StrictObjectSchema<{
  runs: z.ZodArray<typeof playbookRunSchema>;
  activeRun: z.ZodOptional<typeof playbookRunSchema>;
  playbook: z.ZodOptional<typeof playbookSummarySchema>;
  currentState: z.ZodOptional<typeof playbookStateSchema>;
  validEvents: z.ZodOptional<z.ZodArray<typeof playbookTransitionSchema>>;
  operatorActions: z.ZodOptional<z.ZodArray<typeof playbookTransitionSchema>>;
  blockedEvents: z.ZodOptional<z.ZodArray<typeof playbookTransitionSchema>>;
  guidance: z.ZodOptional<z.ZodString>;
  cards: z.ZodOptional<z.ZodArray<typeof ActionsCardSchema>>;
  lifecycle: z.ZodRecord<z.ZodString, typeof lifecycleConfigSchema>;
}> = z
  .object({
    runs: z.array(playbookRunSchema),
    activeRun: playbookRunSchema.optional(),
    playbook: playbookSummarySchema.optional(),
    currentState: playbookStateSchema.optional(),
    validEvents: z.array(playbookTransitionSchema).optional(),
    operatorActions: z.array(playbookTransitionSchema).optional(),
    blockedEvents: z.array(playbookTransitionSchema).optional(),
    guidance: z.string().optional(),
    cards: z.array(ActionsCardSchema).optional(),
    lifecycle: z.record(z.string(), lifecycleConfigSchema),
  })
  .strict();

export type PlaybookStatusResponse = z.output<
  typeof playbookStatusResponseSchema
>;

const successSchema: StrictObjectSchema<{
  success: z.ZodLiteral<true>;
  data: typeof playbookStatusResponseSchema;
}> = z
  .object({ success: z.literal(true), data: playbookStatusResponseSchema })
  .strict();
const errorSchema: StrictObjectSchema<{
  success: z.ZodLiteral<false>;
  error: z.ZodString;
}> = z.object({ success: z.literal(false), error: z.string() }).strict();

export const playbookManageOutputSchema: z.ZodUnion<
  [typeof successSchema, typeof errorSchema]
> = z.union([successSchema, errorSchema]);
