import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";

export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

const playbookStatusParserSchema = z4.enum(["draft", "active", "archived"]);
const playbookAudienceParserSchema = z4.enum(["anchor", "trusted", "public"]);
const playbookCompletionModeParserSchema = z4.enum([
  "agent-confirmed",
  "manual",
]);

const optionalTextSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

const optionalTextParserSchema = z4.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z4.string().min(1).optional(),
);

export const playbookTransitionSchema = z4.object({
  event: z4.string().min(1),
  target: z4.string().min(1),
  operatorAction: z4.boolean().optional(),
  label: optionalTextParserSchema,
  description: optionalTextParserSchema,
  operatorDescription: optionalTextParserSchema,
});

export const playbookStateSchema = z4.object({
  id: z4.string().min(1),
  title: z4.string().min(1),
  prompt: optionalTextParserSchema,
  instructions: z4.array(z4.string().min(1)).default([]),
  doneWhen: z4.array(z4.string().min(1)).default([]),
  transitions: z4.array(playbookTransitionSchema).default([]),
});

export const playbookBodySchema = z4.object({
  purpose: z4.string().min(1),
  operatingRules: z4.array(z4.string().min(1)).default([]),
  initialState: z4.string().min(1),
  states: z4.array(playbookStateSchema).min(1),
  finalStates: z4.array(z4.string().min(1)).min(1),
  nextPrompts: z4.array(z4.string().min(1)).default([]),
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

const playbookEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  status: playbookStatusParserSchema,
  audience: playbookAudienceParserSchema,
  trigger: optionalTextParserSchema,
  lifecycle: optionalTextParserSchema,
  once: z4.boolean().optional(),
  starterText: optionalTextParserSchema,
  description: optionalTextParserSchema,
  starterPrompt: optionalTextParserSchema,
  completionMode: playbookCompletionModeParserSchema,
});

export const playbookSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("playbook"),
  metadata: playbookEntityMetadataParserSchema,
});

export type PlaybookStatus = z.output<typeof playbookStatusSchema>;
export type PlaybookAudience = z.output<typeof playbookAudienceSchema>;
export type PlaybookCompletionMode = z.output<
  typeof playbookCompletionModeSchema
>;
export type PlaybookTransition = z4.output<typeof playbookTransitionSchema>;
export type PlaybookState = z4.output<typeof playbookStateSchema>;
export type PlaybookBody = z4.output<typeof playbookBodySchema>;
export type PlaybookFrontmatter = z.output<typeof playbookFrontmatterSchema>;
export type PlaybookMetadata = z.output<typeof playbookMetadataSchema>;
export type PlaybookEntity = z4.output<typeof playbookSchema>;
