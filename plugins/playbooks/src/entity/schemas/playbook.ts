import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type PlaybookStatusSchema = z.ZodEnum<{
  draft: "draft";
  active: "active";
  archived: "archived";
}>;
type PlaybookAudienceSchema = z.ZodEnum<{
  admin: "admin";
  trusted: "trusted";
  public: "public";
}>;
type PlaybookCompletionModeSchema = z.ZodEnum<{
  "agent-confirmed": "agent-confirmed";
  manual: "manual";
}>;

export const playbookStatusSchema: PlaybookStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);
export const playbookAudienceSchema: PlaybookAudienceSchema = z.enum([
  "admin",
  "trusted",
  "public",
]);
export const playbookCompletionModeSchema: PlaybookCompletionModeSchema =
  z.enum(["agent-confirmed", "manual"]);

export type PlaybookStatus = z.output<typeof playbookStatusSchema>;
export type PlaybookAudience = z.output<typeof playbookAudienceSchema>;
export type PlaybookCompletionMode = z.output<
  typeof playbookCompletionModeSchema
>;

const playbookStatusParserSchema: PlaybookStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);
const playbookAudienceParserSchema: PlaybookAudienceSchema = z.enum([
  "admin",
  "trusted",
  "public",
]);
const playbookCompletionModeParserSchema: PlaybookCompletionModeSchema = z.enum(
  ["agent-confirmed", "manual"],
);

type OptionalTextSchema = z.ZodCodec<
  z.ZodOptional<z.ZodString>,
  z.ZodOptional<z.ZodString>
>;

/**
 * Optional text where blank means absent. A codec rather than a preprocess so
 * the playbook body built on it can be encoded back to markdown.
 */
function blankTextAsUndefined(): OptionalTextSchema {
  return z.codec(z.string().optional(), z.string().min(1).optional(), {
    decode: (value) => (value?.trim().length === 0 ? undefined : value),
    encode: (value) => value,
  });
}

const optionalTextSchema: OptionalTextSchema = blankTextAsUndefined();

const optionalTextParserSchema: OptionalTextSchema = blankTextAsUndefined();

export const playbookTransitionSchema: z.ZodObject<{
  event: z.ZodString;
  target: z.ZodString;
  operatorAction: z.ZodOptional<z.ZodBoolean>;
  label: OptionalTextSchema;
  description: OptionalTextSchema;
  operatorDescription: OptionalTextSchema;
}> = z.object({
  event: z.string().min(1),
  target: z.string().min(1),
  operatorAction: z.boolean().optional(),
  label: optionalTextParserSchema,
  description: optionalTextParserSchema,
  operatorDescription: optionalTextParserSchema,
});

export type PlaybookTransition = z.output<typeof playbookTransitionSchema>;

/**
 * What besides entity events can prove a step done. `reply`: the assistant's
 * saved reply in this run, for steps whose outcome is an answer in chat.
 */
export const playbookProofSourceSchema: z.ZodEnum<{ reply: "reply" }> = z.enum([
  "reply",
]);

export type PlaybookProofSource = z.output<typeof playbookProofSourceSchema>;

type TextListSchema = z.ZodDefault<z.ZodArray<z.ZodString>>;

export const playbookStateSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  prompt: OptionalTextSchema;
  requiredDetails: TextListSchema;
  instructions: TextListSchema;
  doneWhen: TextListSchema;
  provenBy: z.ZodOptional<z.ZodArray<typeof playbookProofSourceSchema>>;
  transitions: z.ZodDefault<z.ZodArray<typeof playbookTransitionSchema>>;
}> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: optionalTextParserSchema,
  requiredDetails: z.array(z.string().min(1)).default([]),
  instructions: z.array(z.string().min(1)).default([]),
  doneWhen: z.array(z.string().min(1)).default([]),
  provenBy: z.array(playbookProofSourceSchema).min(1).optional(),
  transitions: z.array(playbookTransitionSchema).default([]),
});

export type PlaybookState = z.output<typeof playbookStateSchema>;

export const playbookBodySchema: z.ZodObject<{
  purpose: z.ZodString;
  operatingRules: TextListSchema;
  initialState: z.ZodString;
  states: z.ZodArray<typeof playbookStateSchema>;
  finalStates: z.ZodArray<z.ZodString>;
  nextPrompts: TextListSchema;
}> = z.object({
  purpose: z.string().min(1),
  operatingRules: z.array(z.string().min(1)).default([]),
  initialState: z.string().min(1),
  states: z.array(playbookStateSchema).min(1),
  finalStates: z.array(z.string().min(1)).min(1),
  nextPrompts: z.array(z.string().min(1)).default([]),
});

export type PlaybookBody = z.output<typeof playbookBodySchema>;

type PlaybookFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodDefault<PlaybookStatusSchema>;
  audience: z.ZodDefault<PlaybookAudienceSchema>;
  trigger: z.ZodOptional<OptionalTextSchema>;
  lifecycle: z.ZodOptional<OptionalTextSchema>;
  once: z.ZodOptional<z.ZodBoolean>;
  starterText: z.ZodOptional<OptionalTextSchema>;
  description: z.ZodOptional<OptionalTextSchema>;
  starterPrompt: z.ZodOptional<OptionalTextSchema>;
  completionMode: z.ZodDefault<PlaybookCompletionModeSchema>;
}>;

export const playbookFrontmatterSchema: PlaybookFrontmatterSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema.default("active"),
  audience: playbookAudienceSchema.default("admin"),
  trigger: optionalTextSchema.optional(),
  lifecycle: optionalTextSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextSchema.optional(),
  description: optionalTextSchema.optional(),
  starterPrompt: optionalTextSchema.optional(),
  completionMode: playbookCompletionModeSchema.default("agent-confirmed"),
});

export type PlaybookFrontmatter = z.output<typeof playbookFrontmatterSchema>;

type PlaybookMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: PlaybookStatusSchema;
  audience: PlaybookAudienceSchema;
  trigger: z.ZodOptional<OptionalTextSchema>;
  lifecycle: z.ZodOptional<OptionalTextSchema>;
  once: z.ZodOptional<z.ZodBoolean>;
  starterText: z.ZodOptional<OptionalTextSchema>;
  description: z.ZodOptional<OptionalTextSchema>;
  starterPrompt: z.ZodOptional<OptionalTextSchema>;
  completionMode: PlaybookCompletionModeSchema;
}>;

export const playbookMetadataSchema: PlaybookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema,
  audience: playbookAudienceSchema,
  trigger: optionalTextSchema.optional(),
  lifecycle: optionalTextSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextSchema.optional(),
  description: optionalTextSchema.optional(),
  starterPrompt: optionalTextSchema.optional(),
  completionMode: playbookCompletionModeSchema,
});

export type PlaybookMetadata = z.output<typeof playbookMetadataSchema>;

const playbookEntityMetadataParserSchema: PlaybookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusParserSchema,
  audience: playbookAudienceParserSchema,
  trigger: optionalTextParserSchema.optional(),
  lifecycle: optionalTextParserSchema.optional(),
  once: z.boolean().optional(),
  starterText: optionalTextParserSchema.optional(),
  description: optionalTextParserSchema.optional(),
  starterPrompt: optionalTextParserSchema.optional(),
  completionMode: playbookCompletionModeParserSchema,
});

export const playbookSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"playbook">;
    metadata: PlaybookMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("playbook"),
  metadata: playbookEntityMetadataParserSchema,
});

export type PlaybookEntity = z.output<typeof playbookSchema>;
