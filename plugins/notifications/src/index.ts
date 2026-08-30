import {
  NOTIFICATIONS_SEND,
  notificationRecipientSchema,
  sendNotificationSchema,
  type NotificationRecipient,
  type SendNotificationResult,
} from "@brains/contracts";
import {
  defineServicePlugin,
  defineSubscription,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";

export {
  NOTIFICATIONS_SEND,
  notificationRecipientSchema,
  sendNotificationResultSchema,
  sendNotificationSchema,
  type NotificationRecipient,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/contracts";

export interface NotificationsConfig {
  defaultRecipient?: NotificationRecipient | undefined;
}

export type NotificationsConfigInput = NotificationsConfig;

// Unset SETUP_EMAIL_TO interpolates to an empty address in brain.yaml; a
// recipient without an address means "no default recipient", not an invalid
// plugin config — alerts then stay pending on the standard retry path.
const emptyRecipient = z
  .object({ type: z.literal("email"), address: z.string().max(0) })
  .transform((): undefined => undefined);

const notificationsConfigSchema: z.ZodType<
  NotificationsConfig,
  NotificationsConfigInput
> = z.looseObject({
  defaultRecipient: emptyRecipient.or(notificationRecipientSchema).optional(),
});

const notificationsPackage: ServicePackageDefinition<
  typeof notificationsConfigSchema
> = defineServicePlugin({
  id: "notifications",
  config: notificationsConfigSchema,

  // setup first, so `state` is inferred before any slot that destructures it.
  setup: ({ channels, logger }) => ({ channels, logger }),

  subscriptions: ({ config, state }) => [
    defineSubscription({
      topic: NOTIFICATIONS_SEND,
      payload: sendNotificationSchema,
      // Throwing is how a subscription reports a failed response; returning
      // would hand the caller a successful message wrapping a refusal.
      handle: async ({ payload }): Promise<SendNotificationResult> => {
        const recipient = payload.recipient ?? config.defaultRecipient;
        if (!recipient) {
          state.logger.warn("Notification has no recipient");
          throw new Error("Notification recipient missing");
        }

        // Resolve a transport by the recipient's channel type. This plugin
        // never names a transport, so a new one becomes available by
        // registering a delivery provider — no change here.
        const provider = state.channels.getDeliveryProvider(recipient.type);
        if (!provider || !(await provider.isAvailable())) {
          state.logger.warn("Notification has no available transport", {
            channelType: recipient.type,
          });
          throw new Error("Notification transport missing");
        }

        const result = await provider.send({
          recipient: recipient.address,
          subject: payload.title,
          text: payload.body,
          ...(payload.html ? { html: payload.html } : {}),
          sensitivity: payload.sensitivity,
          // Providers dedupe on this, so mint one when the caller has no
          // natural key rather than leaving retries to double-send.
          idempotencyKey: payload.idempotencyKey ?? crypto.randomUUID(),
        });

        if (result.status !== "sent") {
          throw new Error("Notification delivery failed");
        }

        return result.providerDeliveryId
          ? { status: "sent", deliveryId: result.providerDeliveryId }
          : { status: "sent" };
      },
    }),
  ],
});

export default notificationsPackage;
