import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

const playbookStatusParserSchema = z.enum(["draft", "active", "archived"]);
const playbookAudienceParserSchema = z.enum(["anchor", "trusted", "public"]);
const playbookCompletionModeParserSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

const optionalTextSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

const optionalTextParserSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

export const playbookTransitionSchema = z.object({
  event: z.string().min(1),
  target: z.string().min(1),
  operatorAction: z.boolean().optional(),
  label: optionalTextParserSchema,
  description: optionalTextParserSchema,
  operatorDescription: optionalTextParserSchema,
});

export const playbookStateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: optionalTextParserSchema,
  instructions: z.array(z.string().min(1)).default([]),
  doneWhen: z.array(z.string().min(1)).default([]),
  transitions: z.array(playbookTransitionSchema).default([]),
});

export const playbookBodySchema = z.object({
  purpose: z.string().min(1),
  operatingRules: z.array(z.string().min(1)).default([]),
  initialState: z.string().min(1),
  states: z.array(playbookStateSchema).min(1),
  finalStates: z.array(z.string().min(1)).min(1),
  nextPrompts: z.array(z.string().min(1)).default([]),
});

export const playbookFrontmatterSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema.default("active"),
  audience: playbookAudienceSchema.default("anchor"),
  trigger: optionalTextSchema,
  lifecycle: optionalTextSchema,
  once: z.boolean().optional(),
  starterText: optionalTextSchema,
  description: optionalTextSchema,
  starterPrompt: optionalTextSchema,
  completionMode: playbookCompletionModeSchema.default("agent-confirmed"),
});

export const playbookMetadataSchema = z.object({
  title: z.string(),
  status: playbookStatusSchema,
  audience: playbookAudienceSchema,
  trigger: optionalTextSchema,
  lifecycle: optionalTextSchema,
  once: z.boolean().optional(),
  starterText: optionalTextSchema,
  description: optionalTextSchema,
  starterPrompt: optionalTextSchema,
  completionMode: playbookCompletionModeSchema,
});

const playbookEntityMetadataParserSchema = z.object({
  title: z.string(),
  status: playbookStatusParserSchema,
  audience: playbookAudienceParserSchema,
  trigger: optionalTextParserSchema,
  lifecycle: optionalTextParserSchema,
  once: z.boolean().optional(),
  starterText: optionalTextParserSchema,
  description: optionalTextParserSchema,
  starterPrompt: optionalTextParserSchema,
  completionMode: playbookCompletionModeParserSchema,
});

export const playbookSchema = baseEntityParserSchema.extend({
  entityType: z.literal("playbook"),
  metadata: playbookEntityMetadataParserSchema,
});

export type PlaybookStatus = z.output<typeof playbookStatusSchema>;
export type PlaybookAudience = z.output<typeof playbookAudienceSchema>;
export type PlaybookCompletionMode = z.output<
  typeof playbookCompletionModeSchema
>;
export type PlaybookTransition = z.output<typeof playbookTransitionSchema>;
export type PlaybookState = z.output<typeof playbookStateSchema>;
export type PlaybookBody = z.output<typeof playbookBodySchema>;
export type PlaybookFrontmatter = z.output<typeof playbookFrontmatterSchema>;
export type PlaybookMetadata = z.output<typeof playbookMetadataSchema>;
export type PlaybookEntity = z.output<typeof playbookSchema>;
