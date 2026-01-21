import type { PluginTool, ServicePluginContext } from "@brains/plugins";
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

// Schema for send newsletter tool parameters
const sendParamsSchema = z.object({
  subject: z.string().describe("Newsletter subject line"),
  body: z.string().describe("Newsletter body content (markdown supported)"),
  immediate: z
    .boolean()
    .default(false)
    .describe("Send immediately (true) or save as draft (false)"),
  scheduledFor: z
    .string()
    .datetime()
    .optional()
    .describe("Schedule for specific time (ISO 8601 format)"),
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

          return toolSuccess(
            {
              subscriberId: subscriber.id,
              email: subscriber.email,
              status: subscriber.subscriber_type,
            },
            `Subscribed ${input.email} successfully`,
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

  // Send newsletter tool
  tools.push(
    createTypedTool(
      pluginId,
      "send",
      "Send a newsletter or save as draft. Use immediate=true to send now, or provide scheduledFor for scheduled delivery.",
      sendParamsSchema,
      async (input) => {
        try {
          // Determine status based on input
          let status: "draft" | "about_to_send" | "scheduled" = "draft";
          if (input.immediate) {
            status = "about_to_send";
          } else if (input.scheduledFor) {
            status = "scheduled";
          }

          const email = await client.createEmail({
            subject: input.subject,
            body: input.body,
            status,
            ...(input.scheduledFor && { publish_date: input.scheduledFor }),
          });

          const action =
            status === "about_to_send"
              ? "sent"
              : status === "scheduled"
                ? "scheduled"
                : "saved as draft";

          return toolSuccess(
            {
              emailId: email.id,
              subject: email.subject,
              status: email.status,
            },
            `Newsletter "${input.subject}" ${action}`,
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
