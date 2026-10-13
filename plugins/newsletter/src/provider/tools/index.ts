import type { Tool, ToolResult } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { NewsletterDeliveryProvider } from "../contracts";

const toolEmailSchema = z.string().email({ pattern: z.regexes.html5Email });

export const subscribersInputSchema: z.ZodObject<{
  action: z.ZodDefault<
    z.ZodEnum<{
      subscribe: "subscribe";
      unsubscribe: "unsubscribe";
      list: "list";
    }>
  >;
  email: z.ZodOptional<z.ZodString>;
  name: z.ZodOptional<z.ZodString>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  type: z.ZodOptional<
    z.ZodEnum<{
      unactivated: "unactivated";
      regular: "regular";
      unsubscribed: "unsubscribed";
    }>
  >;
  limit: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  action: z
    .enum(["subscribe", "unsubscribe", "list"])
    .default("subscribe")
    .describe("Subscriber action to perform"),
  email: toolEmailSchema
    .optional()
    .describe("Email address for subscribe or unsubscribe"),
  name: z.string().optional().describe("Subscriber name for subscribe"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Provider-supported subscriber tags for subscribe"),
  type: z
    .enum(["unactivated", "regular", "unsubscribed"])
    .optional()
    .describe("Subscriber status filter for list"),
  limit: z.number().optional().describe("Maximum list results"),
});

export type SubscribersInput = z.output<typeof subscribersInputSchema>;
export type SubscribersSchemaInput = z.input<typeof subscribersInputSchema>;
export type SubscriberAction = SubscribersInput["action"];

const newsletterSignupInputSchema = z.object({
  email: toolEmailSchema.describe("Email address to subscribe"),
  name: z.string().optional().describe("Subscriber name"),
});

export function createNewsletterSubscriberTools(
  provider: NewsletterDeliveryProvider,
): Tool[] {
  return [
    createTool(
      "newsletter",
      "subscribers",
      "Manage newsletter subscribers with an action discriminator. Use action=subscribe to add an email, action=unsubscribe to remove an email, and action=list to list subscribers with optional status filtering.",
      subscribersInputSchema,
      async (input): Promise<ToolResult> =>
        handleSubscriberAction(provider, input),
      { sideEffects: "external" },
    ),
    createTool(
      "newsletter",
      "signup",
      "Subscribe one address from the public newsletter signup form.",
      newsletterSignupInputSchema,
      async (input): Promise<ToolResult> => subscribe(provider, input),
      {
        visibility: "public",
        sideEffects: "external",
        agentTool: false,
        directMcpExposure: "none",
      },
    ),
  ];
}

async function handleSubscriberAction(
  provider: NewsletterDeliveryProvider,
  input: SubscribersInput,
): Promise<ToolResult> {
  switch (input.action) {
    case "subscribe":
      return subscribe(provider, input);
    case "unsubscribe":
      return unsubscribe(provider, input);
    case "list":
      return listSubscribers(provider, input);
  }
}

async function subscribe(
  provider: NewsletterDeliveryProvider,
  input: Pick<SubscribersInput, "email" | "name" | "tags">,
): Promise<ToolResult> {
  if (!input.email) return toolError("email is required for subscribe action");

  try {
    const subscriber = await provider.createSubscriber({
      email: input.email,
      ...(input.name && { name: input.name }),
      ...(input.tags && { tags: input.tags }),
    });
    const isAlreadySubscribed = subscriber.status === "already_subscribed";
    return toolSuccess(
      {
        subscriberId: subscriber.id,
        email: subscriber.email,
        status: subscriber.status,
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
  provider: NewsletterDeliveryProvider,
  input: SubscribersInput,
): Promise<ToolResult> {
  if (!input.email)
    return toolError("email is required for unsubscribe action");

  try {
    await provider.unsubscribe(input.email);
    return toolSuccess(
      { email: input.email },
      `Unsubscribed ${input.email} successfully`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error));
  }
}

async function listSubscribers(
  provider: NewsletterDeliveryProvider,
  input: SubscribersInput,
): Promise<ToolResult> {
  try {
    const result = await provider.listSubscribers({
      ...(input.type && { type: input.type }),
      ...(input.limit && { limit: input.limit }),
    });
    return toolSuccess(
      {
        subscribers: result.subscribers.map((subscriber) => ({
          id: subscriber.id,
          email: subscriber.email,
          status: subscriber.status,
        })),
        count: result.count,
      },
      `Found ${result.count} subscribers`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error));
  }
}
