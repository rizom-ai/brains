import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
  authPrincipalResolveRequestSchema,
  authAccountSettingsReadRequestSchema,
} from "@brains/contracts";
import type { LocalDatabaseRpcClient } from "./local-database-endpoint";
import {
  messageResponseSchema,
  type IMessageBus,
} from "@brains/messaging-service";
import { z } from "@brains/utils/zod";

const service = "auth-worker";
const requestSchema = z.discriminatedUnion("channel", [
  z.strictObject({
    channel: z.literal(AUTH_PRINCIPAL_RESOLVE_CHANNEL),
    payload: authPrincipalResolveRequestSchema,
  }),
  z.strictObject({
    channel: z.literal(AUTH_ACCOUNT_SETTINGS_READ_CHANNEL),
    payload: authAccountSettingsReadRequestSchema,
  }),
]);

/** Narrow private RPC bridge, not a general message-bus or auth-administration proxy. */
export function registerAuthWorkerBridge(input: {
  messageBus: IMessageBus;
  client: LocalDatabaseRpcClient | undefined;
  registerOwnerHandler: (
    service: string,
    handler: (payload: unknown, signal: AbortSignal) => Promise<unknown>,
  ) => void;
}): () => void {
  input.registerOwnerHandler(service, async (payload, signal) => {
    const request = requestSchema.parse(payload);
    signal.throwIfAborted();
    return input.messageBus.send({
      type: request.channel,
      payload: request.payload,
      sender: "auth-worker",
    });
  });
  const client = input.client;
  if (!client) return () => {};
  const subscriptions = [
    AUTH_PRINCIPAL_RESOLVE_CHANNEL,
    AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
  ].map((channel) =>
    input.messageBus.subscribe(channel, async (message) => {
      const request = requestSchema.parse({
        channel,
        payload: message.payload,
      });
      return messageResponseSchema.parse(
        await client.request(service, request),
      );
    }),
  );
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
