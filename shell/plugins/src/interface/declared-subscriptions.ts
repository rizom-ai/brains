import { toSdkError, type SdkErrorCode } from "@brains/contracts";
import { createRequester } from "../internal/requester";
import { createIdentityReader } from "../internal/authoring-readers";
import type {
  AnySubscriptionDefinition,
  SubscriptionEntityReader,
} from "../contracts/subscription";
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
  // A reader must be a reader at runtime too, not a narrowed annotation over
  // the full entity service with mutation and host capabilities still attached.
  const entities: SubscriptionEntityReader = Object.freeze({
    getEntity: context.entityService.getEntity.bind(context.entityService),
    listEntities: context.entityService.listEntities.bind(
      context.entityService,
    ),
    getEntityTypes: context.entityService.getEntityTypes.bind(
      context.entityService,
    ),
  });
  const topics = new Set<string>();
  for (const subscription of subscriptions) {
    if (topics.has(subscription.topic)) {
      throw new Error(
        `${label} subscribes to "${subscription.topic}" more than once`,
      );
    }
    topics.add(subscription.topic);
    context.messaging.subscribe(subscription.topic, async (message) => {
      let fallback: SdkErrorCode = "invalid_input";
      try {
        const payload = subscription.payload.parse(message.payload);
        fallback = "handler_failed";
        const answered = await subscription.handle({
          payload,
          source: message.source,
          entities,
          identity: createIdentityReader(context.identity),
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
        });
        // Validate the wire value here; typed requesters parse that same value
        // at their boundary. Sending the transformed output would apply a
        // response transform to its own output instead of its declared input.
        fallback = "invalid_response";
        subscription.response?.parse(answered);
        return { success: true, data: answered };
      } catch (error) {
        const failure = toSdkError(error, fallback);
        return { success: false, code: failure.code, error: failure.message };
      }
    });
  }
}
