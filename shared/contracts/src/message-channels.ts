import { z } from "@brains/utils/zod";
import { defineChannel, type Channel } from "./channel";

export const ENTITY_CHANNELS = {
  created: "entity:created",
  updated: "entity:updated",
  deleted: "entity:deleted",
  embeddingReady: "entity:embedding:ready",
} as const;

export const JOB_CHANNELS = {
  progress: "job-progress",
} as const;

export const NEWSLETTER_CHANNELS = {
  generation: "newsletter:generation",
} as const;

/** The publish events content-pipeline broadcasts. */
export const PUBLISH_CHANNELS = {
  completed: "publish:completed",
  failed: "publish:failed",
} as const;

type PublishCompletedPayloadSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  result: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
  }>;
}>;

/** An entity was published: the provider's id for it, and its URL if it has one. */
export const publishCompletedPayloadSchema: PublishCompletedPayloadSchema =
  z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    result: z.object({
      id: z.string(),
      url: z.string().optional(),
    }),
  });

export type PublishCompletedPayload = z.output<
  typeof publishCompletedPayloadSchema
>;

type PublishFailedPayloadSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  error: z.ZodString;
  retryCount: z.ZodNumber;
  willRetry: z.ZodBoolean;
}>;

/** A publish failed, with how often it was tried and whether it will be again. */
export const publishFailedPayloadSchema: PublishFailedPayloadSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  error: z.string(),
  retryCount: z.number(),
  willRetry: z.boolean(),
});

export type PublishFailedPayload = z.output<typeof publishFailedPayloadSchema>;

export const publishCompletedChannel: Channel<
  PublishCompletedPayload,
  unknown,
  typeof PUBLISH_CHANNELS.completed
> = defineChannel(PUBLISH_CHANNELS.completed, publishCompletedPayloadSchema);

export const publishFailedChannel: Channel<
  PublishFailedPayload,
  unknown,
  typeof PUBLISH_CHANNELS.failed
> = defineChannel(PUBLISH_CHANNELS.failed, publishFailedPayloadSchema);

export const SHELL_CHANNELS = {
  contentGeneration: "shell:content-generation",
  embedding: "shell:embedding",
} as const;

export const PLUGIN_CHANNELS = {
  toolExecute: (pluginId: string): string => `plugin:${pluginId}:tool:execute`,
} as const;
