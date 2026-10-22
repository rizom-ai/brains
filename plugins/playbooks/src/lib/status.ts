import { ActionsCardSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  playbookAudienceSchema,
  playbookStateSchema,
  playbookStatusSchema,
} from "../entity";
import { playbookRunSchema, playbookRunStatusSchema } from "../run-store";

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

/** Another run in scope, named for reference; its record is a status call away. */
export const playbookRunSummarySchema: StrictObjectSchema<{
  id: z.ZodString;
  playbookId: z.ZodString;
  currentState: z.ZodString;
  status: typeof playbookRunStatusSchema;
}> = z
  .object({
    id: z.string().min(1),
    playbookId: z.string().min(1),
    currentState: z.string().min(1),
    status: playbookRunStatusSchema,
  })
  .strict();

export type PlaybookRunSummary = z.output<typeof playbookRunSummarySchema>;

const eventNamesSchema: z.ZodArray<z.ZodString> = z.array(z.string().min(1));

/**
 * Shared result of status, start, and send-event; full source stays in the
 * engine. Each fact appears once: the active run only in `activeRun`, the
 * state's instructions, Done When, and transitions only in `currentState`.
 * The event lists name events of `currentState.transitions`, and
 * `guidance` appears only after an operator action, to carry its source
 * state. Per-turn rules live in the active-playbook context item.
 */
export const playbookStatusResponseSchema: StrictObjectSchema<{
  otherRuns: z.ZodOptional<z.ZodArray<typeof playbookRunSummarySchema>>;
  activeRun: z.ZodOptional<typeof playbookRunSchema>;
  playbook: z.ZodOptional<typeof playbookSummarySchema>;
  currentState: z.ZodOptional<typeof playbookStateSchema>;
  validEvents: z.ZodOptional<typeof eventNamesSchema>;
  operatorActions: z.ZodOptional<typeof eventNamesSchema>;
  blockedEvents: z.ZodOptional<typeof eventNamesSchema>;
  guidance: z.ZodOptional<z.ZodString>;
  cards: z.ZodOptional<z.ZodArray<typeof ActionsCardSchema>>;
}> = z
  .object({
    otherRuns: z.array(playbookRunSummarySchema).optional(),
    activeRun: playbookRunSchema.optional(),
    playbook: playbookSummarySchema.optional(),
    currentState: playbookStateSchema.optional(),
    validEvents: eventNamesSchema.optional(),
    operatorActions: eventNamesSchema.optional(),
    blockedEvents: eventNamesSchema.optional(),
    guidance: z.string().optional(),
    cards: z.array(ActionsCardSchema).optional(),
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
