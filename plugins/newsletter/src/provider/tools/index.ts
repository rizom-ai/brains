import type { Tool, ToolResult } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { ButtondownClient } from "../lib/buttondown-client";

const toolEmailSchema = z.string().email({ pattern: z.regexes.html5Email });

export type SubscriberAction = "subscribe" | "unsubscribe" | "list";

export interface SubscribersInput {
  action: SubscriberAction;
  email?: string | undefined;
  name?: string | undefined;
  tags?: string[] | undefined;
  type?: "unactivated" | "regular" | "unsubscribed" | undefined;
  limit?: number | undefined;
}

export interface SubscribersSchemaInput {
  action?: SubscriberAction | undefined;
  email?: string | undefined;
  name?: string | undefined;
  tags?: string[] | undefined;
  type?: "unactivated" | "regular" | "unsubscribed" | undefined;
  limit?: number | undefined;
}

export const subscribersInputSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<SubscribersInput, SubscribersSchemaInput> = z.object({
  action: z
    .enum(["subscribe", "unsubscribe", "list"])
    .default("subscribe")
    .describe("Subscriber action to perform"),
  email: toolEmailSchema
    .optional()
    .describe("Email address for subscribe or unsubscribe"),
  name: z.string().optional().describe("Subscriber name for subscribe"),
  tags: z.array(z.string()).optional().describe("Tags to apply for subscribe"),
  type: z
    .enum(["unactivated", "regular", "unsubscribed"])
    .optional()
    .describe("Subscriber status filter for list"),
  limit: z.number().optional().describe("Maximum list results"),
});

interface ButtondownConfig {
  apiKey: string;
  doubleOptIn: boolean;
}

export function createButtondownTools(
  pluginId: string,
  config: ButtondownConfig,
  logger: Logger,
): Tool[] {
  void pluginId;
  const client = new ButtondownClient(config, logger);

  return [
    createTool(
      "newsletter",
      "subscribers",
      "Manage newsletter subscribers with an action discriminator. Use action=subscribe to add an email, action=unsubscribe to remove an email, and action=list to list subscribers with optional status filtering.",
      subscribersInputSchema,
      async (input): Promise<ToolResult> =>
        handleSubscriberAction(client, input),
      { sideEffects: "external" },
    ),
  ];
}

async function handleSubscriberAction(
  client: ButtondownClient,
  input: SubscribersInput,
): Promise<ToolResult> {
  switch (input.action) {
    case "subscribe":
      return subscribe(client, input);
    case "unsubscribe":
      return unsubscribe(client, input);
    case "list":
      return listSubscribers(client, input);
  }
}

async function subscribe(
  client: ButtondownClient,
  input: SubscribersInput,
): Promise<ToolResult> {
  if (!input.email) return toolError("email is required for subscribe action");

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
        message: isAlreadySubscribed ? "already_subscribed" : "subscribed",
      },
      isAlreadySubscribed
        ? `${input.email} is already subscribed`
        : `Subscribed ${input.email} successfully`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error));
  }
}

async function unsubscribe(
  client: ButtondownClient,
  input: SubscribersInput,
): Promise<ToolResult> {
  if (!input.email)
    return toolError("email is required for unsubscribe action");

  try {
    await client.unsubscribe(input.email);
    return toolSuccess(
      { email: input.email },
      `Unsubscribed ${input.email} successfully`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error));
  }
}

async function listSubscribers(
  client: ButtondownClient,
  input: SubscribersInput,
): Promise<ToolResult> {
  try {
    const result = await client.listSubscribers({
      ...(input.type && { type: input.type }),
      ...(input.limit && { limit: input.limit }),
    });
    return toolSuccess(
      {
        subscribers: result.results.map((subscriber) => ({
          id: subscriber.id,
          email: subscriber.email,
          status: subscriber.subscriber_type,
        })),
        count: result.count,
      },
      `Found ${result.count} subscribers`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error));
  }
}
