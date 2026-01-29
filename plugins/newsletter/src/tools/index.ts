import type {
  PluginTool,
  ServicePluginContext,
  ToolContext,
} from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { z } from "@brains/utils";
import { ButtondownClient } from "../lib/buttondown-client";
import type { ButtondownConfig } from "../config";

// Schema for subscribe tool parameters
const subscribeParamsSchema = z.object({
  email: z.string().email().describe("Email address to subscribe"),
  name: z.string().optional().describe("Subscriber name (optional)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags to apply to subscriber (optional)"),
});

// Schema for unsubscribe tool parameters
const unsubscribeParamsSchema = z.object({
  email: z.string().email().describe("Email address to unsubscribe"),
});

// Schema for list subscribers tool parameters
const listSubscribersParamsSchema = z.object({
  type: z
    .enum(["unactivated", "regular", "unsubscribed"])
    .optional()
    .describe("Filter by subscriber status"),
  limit: z.number().optional().describe("Maximum number of results"),
});

// Schema for generate newsletter tool parameters
const generateParamsSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe("AI generation prompt for newsletter content"),
  sourceEntityIds: z
    .array(z.string())
    .optional()
    .describe("Entity IDs to include in newsletter (e.g., blog post IDs)"),
  sourceEntityType: z
    .enum(["post"])
    .optional()
    .describe("Type of source entities (currently only 'post' supported)"),
  content: z
    .string()
    .optional()
    .describe("Direct newsletter content (skips AI generation)"),
  subject: z
    .string()
    .optional()
    .describe("Newsletter subject line (AI-generated if not provided)"),
  addToQueue: z
    .boolean()
    .optional()
    .describe("Create as queued (true) or draft (false, default)"),
});

/**
 * Create newsletter plugin tools
 */
export function createNewsletterTools(
  pluginId: string,
  context: ServicePluginContext,
  buttondownConfig?: ButtondownConfig,
): PluginTool[] {
  // Return empty array if no config - tools require Buttondown API
  if (!buttondownConfig?.apiKey) {
    return [];
  }

  const client = new ButtondownClient(buttondownConfig, context.logger);
  const tools: PluginTool[] = [];

  // Subscribe tool
  tools.push(
    createTypedTool(
      pluginId,
      "subscribe",
      "Subscribe an email address to the newsletter. Uses double opt-in by default.",
      subscribeParamsSchema,
      async (input) => {
        try {
          const subscriber = await client.createSubscriber({
            email: input.email,
            ...(input.name && { name: input.name }),
            ...(input.tags && { tags: input.tags }),
          });

          const isAlreadySubscribed =
            subscriber.subscriber_type === "already_subscribed";
          const message = isAlreadySubscribed
            ? "already_subscribed"
            : "subscribed";

          return toolSuccess(
            {
              subscriberId: subscriber.id,
              email: subscriber.email,
              status: subscriber.subscriber_type,
              message,
            },
            isAlreadySubscribed
              ? `${input.email} is already subscribed`
              : `Subscribed ${input.email} successfully`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return toolError(msg);
        }
      },
    ),
  );

  // Unsubscribe tool
  tools.push(
    createTypedTool(
      pluginId,
      "unsubscribe",
      "Unsubscribe an email address from the newsletter.",
      unsubscribeParamsSchema,
      async (input) => {
        try {
          await client.unsubscribe(input.email);

          return toolSuccess(
            { email: input.email },
            `Unsubscribed ${input.email} successfully`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return toolError(msg);
        }
      },
    ),
  );

  // List subscribers tool
  tools.push(
    createTypedTool(
      pluginId,
      "list_subscribers",
      "List newsletter subscribers with optional filtering by status.",
      listSubscribersParamsSchema,
      async (input) => {
        try {
          const result = await client.listSubscribers({
            ...(input.type && { type: input.type }),
            ...(input.limit && { limit: input.limit }),
          });

          return toolSuccess(
            {
              subscribers: result.results.map((s) => ({
                id: s.id,
                email: s.email,
                status: s.subscriber_type,
              })),
              count: result.count,
            },
            `Found ${result.count} subscribers`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return toolError(msg);
        }
      },
    ),
  );

  // Generate newsletter tool
  tools.push(
    createTypedTool(
      pluginId,
      "generate",
      "Queue a job to generate newsletter content. Requires at least one of: prompt (AI generation), sourceEntityIds (generate from blog posts), or content (direct content with subject).",
      generateParamsSchema,
      async (input, toolContext: ToolContext) => {
        // Validate that at least one content source is provided
        if (!input.prompt && !input.sourceEntityIds?.length && !input.content) {
          return toolError(
            "At least one of prompt, sourceEntityIds, or content is required",
          );
        }

        try {
          const jobId = await context.jobs.enqueue(
            "newsletter-generation",
            {
              prompt: input.prompt,
              sourceEntityIds: input.sourceEntityIds,
              sourceEntityType: input.sourceEntityType,
              content: input.content,
              subject: input.subject,
              addToQueue: input.addToQueue,
            },
            toolContext,
            {
              source: `${pluginId}_generate`,
              metadata: {
                operationType: "content_operations",
                operationTarget: "newsletter",
              },
            },
          );

          return toolSuccess(
            { jobId },
            `Newsletter generation job queued (jobId: ${jobId})`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return toolError(msg);
        }
      },
    ),
  );

  return tools;
}
