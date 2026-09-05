import {
  defineTool,
  z,
  type AnyServiceToolDefinition,
} from "@brains/sdk/services";
import type { ButtondownClient } from "./lib/buttondown-client";

const toolEmailSchema = z.email({ pattern: z.regexes.html5Email });

export const subscribersInputSchema: z.ZodObject<{
  action: z.ZodDefault<
    z.ZodEnum<{
      subscribe: "subscribe";
      unsubscribe: "unsubscribe";
      list: "list";
    }>
  >;
  email: z.ZodOptional<z.ZodEmail>;
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
  tags: z.array(z.string()).optional().describe("Tags to apply for subscribe"),
  type: z
    .enum(["unactivated", "regular", "unsubscribed"])
    .optional()
    .describe("Subscriber status filter for list"),
  limit: z.number().optional().describe("Maximum list results"),
});

export type SubscribersInput = z.output<typeof subscribersInputSchema>;
export type SubscribersSchemaInput = z.input<typeof subscribersInputSchema>;
export type SubscriberAction = SubscribersInput["action"];

const subscribedSchema: z.ZodObject<{
  subscriberId: z.ZodString;
  email: z.ZodString;
  status: z.ZodString;
  message: z.ZodEnum<{
    subscribed: "subscribed";
    already_subscribed: "already_subscribed";
  }>;
}> = z.object({
  subscriberId: z.string(),
  email: z.string(),
  status: z.string(),
  message: z.enum(["subscribed", "already_subscribed"]),
});

const subscribersOutputSchema = z.union([
  subscribedSchema,
  z.object({ email: z.string() }),
  z.object({
    subscribers: z.array(
      z.object({
        id: z.string(),
        email: z.string(),
        status: z.string(),
      }),
    ),
    count: z.number(),
  }),
]);

export type SubscribedResult = z.output<typeof subscribedSchema>;

/** Add one address, reporting whether it was already on the list. */
export async function subscribe(
  client: ButtondownClient,
  input: {
    email: string;
    name?: string | undefined;
    tags?: string[] | undefined;
  },
): Promise<SubscribedResult> {
  const subscriber = await client.createSubscriber({
    email: input.email,
    ...(input.name && { name: input.name }),
    ...(input.tags && { tags: input.tags }),
  });
  const alreadySubscribed = subscriber.subscriber_type === "already_subscribed";
  return {
    subscriberId: subscriber.id,
    email: subscriber.email,
    status: subscriber.subscriber_type,
    message: alreadySubscribed ? "already_subscribed" : "subscribed",
  };
}

/**
 * Subscriber management as one tool with an action discriminator. Only
 * offered once Buttondown is configured, since without a key every action
 * could only answer "not configured".
 */
export function subscribersTool(
  client: ButtondownClient,
): AnyServiceToolDefinition {
  return defineTool({
    name: "subscribers",
    description:
      "Manage newsletter subscribers with an action discriminator. Use action=subscribe to add an email, action=unsubscribe to remove an email, and action=list to list subscribers with optional status filtering.",
    input: subscribersInputSchema,
    output: subscribersOutputSchema,
    sideEffects: "external",
    execute: async ({ input }) => {
      switch (input.action) {
        case "subscribe": {
          if (!input.email) {
            throw new Error("email is required for subscribe action");
          }
          return subscribe(client, {
            email: input.email,
            name: input.name,
            tags: input.tags,
          });
        }
        case "unsubscribe": {
          if (!input.email) {
            throw new Error("email is required for unsubscribe action");
          }
          await client.unsubscribe(input.email);
          return { email: input.email };
        }
        case "list": {
          const result = await client.listSubscribers({
            ...(input.type && { type: input.type }),
            ...(input.limit && { limit: input.limit }),
          });
          return {
            subscribers: result.results.map((subscriber) => ({
              id: subscriber.id,
              email: subscriber.email,
              status: subscriber.subscriber_type,
            })),
            count: result.count,
          };
        }
      }
    },
  });
}
