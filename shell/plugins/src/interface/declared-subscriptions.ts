import { getErrorMessage } from "@brains/utils/error";
import { createRequester } from "../internal/requester";
import type { AnySubscriptionDefinition } from "../contracts/subscription";
import type { InterfacePluginContext } from "./context";

/**
 * Register the subscriptions a declaration made, the same way for every
 * interface family.
 *
 * The payload schema is the boundary: a malformed request is refused before
 * the handler runs. A handler that cannot answer says so by throwing; the
 * caller then sees a failed response rather than a successful one wrapping a
 * refusal. Two families registered this identically; the loop lives once.
 */
export function registerDeclaredSubscriptions(input: {
  /** How the declaration names itself in errors, e.g. `Interface "a2a"`. */
  readonly label: string;
  readonly subscriptions: readonly AnySubscriptionDefinition[];
  readonly context: Pick<
    InterfacePluginContext,
    "messaging" | "entityService" | "identity"
  >;
}): void {
  const { label, subscriptions, context } = input;
  const topics = new Set<string>();
  for (const subscription of subscriptions) {
    if (topics.has(subscription.topic)) {
      throw new Error(
        `${label} subscribes to "${subscription.topic}" more than once`,
      );
    }
    topics.add(subscription.topic);
    context.messaging.subscribe(subscription.topic, async (message) => {
      const payload = subscription.payload.safeParse(message.payload);
      if (!payload.success) {
        return {
          success: false,
          error: `${label} rejected a malformed "${subscription.topic}" request`,
        };
      }
      try {
        return {
          success: true,
          data: await subscription.handle({
            payload: payload.data,
            source: message.source,
            entities: context.entityService,
            identity: context.identity,
            messaging: {
              request: createRequester((outbound) =>
                context.messaging.send(outbound),
              ),
              publish: async (outbound): Promise<void> => {
                await context.messaging.send({
                  type: outbound.topic,
                  payload: outbound.data,
                  broadcast: true,
                });
              },
            },
          }),
        };
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    });
  }
}
