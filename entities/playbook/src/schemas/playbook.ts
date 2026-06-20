import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils";

export const playbookStatusSchema = z.enum(["draft", "active", "archived"]);
export const playbookAudienceSchema = z.enum(["anchor", "trusted", "public"]);
export const playbookCompletionModeSchema = z.enum([
  "agent-confirmed",
  "manual",
]);

const optionalTextSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(1).optional(),
);

export const playbookTransitionSchema = z.object({
  event: z.string().min(1),
  target: z.string().min(1),
  operatorAction: z.boolean().optional(),
  label: optionalTextSchema,
  description: optionalTextSchema,
  operatorDescription: optionalTextSchema,
});

export const playbookStateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: optionalTextSchema,
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

export const playbookSchema = baseEntitySchema.extend({
  entityType: z.literal("playbook"),
  metadata: playbookMetadataSchema,
});

export const playbookConfigSchema = z.object({});

export type PlaybookStatus = z.infer<typeof playbookStatusSchema>;
export type PlaybookAudience = z.infer<typeof playbookAudienceSchema>;
export type PlaybookCompletionMode = z.infer<
  typeof playbookCompletionModeSchema
>;
export type PlaybookTransition = z.infer<typeof playbookTransitionSchema>;
export type PlaybookState = z.infer<typeof playbookStateSchema>;
export type PlaybookBody = z.infer<typeof playbookBodySchema>;
export type PlaybookFrontmatter = z.infer<typeof playbookFrontmatterSchema>;
export type PlaybookMetadata = z.infer<typeof playbookMetadataSchema>;
export type PlaybookEntity = z.infer<typeof playbookSchema>;
export type PlaybookConfig = z.infer<typeof playbookConfigSchema>;
