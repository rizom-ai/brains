import type { PluginTool } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage, z } from "@brains/utils";
import { ButtondownClient } from "../lib/buttondown-client";

const subscribeParamsSchema = z.object({
  email: z.string().email().describe("Email address to subscribe"),
  name: z.string().optional().describe("Subscriber name (optional)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags to apply to subscriber (optional)"),
});

const unsubscribeParamsSchema = z.object({
  email: z.string().email().describe("Email address to unsubscribe"),
});

const listSubscribersParamsSchema = z.object({
  type: z
    .enum(["unactivated", "regular", "unsubscribed"])
    .optional()
    .describe("Filter by subscriber status"),
  limit: z.number().optional().describe("Maximum number of results"),
});

interface ButtondownConfig {
  apiKey: string;
  doubleOptIn: boolean;
}

export function createButtondownTools(
  pluginId: string,
  config: ButtondownConfig,
  logger: Logger,
): PluginTool[] {
  const client = new ButtondownClient(config, logger);

  return [
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
          return toolSuccess(
            {
              subscriberId: subscriber.id,
              email: subscriber.email,
              status: subscriber.subscriber_type,
              message: isAlreadySubscribed
                ? "already_subscribed"
                : "subscribed",
            },
            isAlreadySubscribed
              ? `${input.email} is already subscribed`
              : `Subscribed ${input.email} successfully`,
          );
        } catch (error) {
          return toolError(getErrorMessage(error));
        }
      },
    ),
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
          return toolError(getErrorMessage(error));
        }
      },
    ),
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
          return toolError(getErrorMessage(error));
        }
      },
    ),
  ];
}
