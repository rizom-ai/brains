import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";
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

/**
 * Create newsletter plugin tools
 * Generate tool is always available; subscriber tools require Buttondown API
 */
export function createNewsletterTools(
  pluginId: string,
  context: ServicePluginContext,
  buttondownConfig?: ButtondownConfig,
): PluginTool[] {
  const tools: PluginTool[] = [];

  if (buttondownConfig?.apiKey) {
    const client = new ButtondownClient(buttondownConfig, context.logger);
    tools.push(...createSubscriberTools(pluginId, client));
  }

  return tools;
}

/**
 * Create subscriber management tools (require Buttondown API)
 */
function createSubscriberTools(
  pluginId: string,
  client: ButtondownClient,
): PluginTool[] {
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
          const msg = getErrorMessage(error);
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
          const msg = getErrorMessage(error);
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
          const msg = getErrorMessage(error);
          return toolError(msg);
        }
      },
    ),
  );

  return tools;
}
