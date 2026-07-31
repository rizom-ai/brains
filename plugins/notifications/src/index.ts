import {
  NOTIFICATIONS_SEND,
  notificationRecipientSchema,
  sendNotificationSchema,
  type NotificationRecipient,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/notification-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

export {
  NOTIFICATIONS_SEND,
  notificationRecipientSchema,
  sendNotificationResultSchema,
  sendNotificationSchema,
  type NotificationRecipient,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/notification-contracts";

export interface NotificationsConfig {
  defaultRecipient?: NotificationRecipient | undefined;
}

export type NotificationsConfigInput = NotificationsConfig;

const notificationsConfigSchema: z.ZodType<
  NotificationsConfig,
  NotificationsConfigInput
> = z.looseObject({
  defaultRecipient: notificationRecipientSchema.optional(),
});

export class NotificationsPlugin extends ServicePlugin<
  NotificationsConfig,
  NotificationsConfigInput
> {
  constructor(config: NotificationsConfigInput = {}) {
    super("notifications", packageJson, config, notificationsConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.messaging.subscribe<SendNotificationInput, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      async (message) => {
        const input = sendNotificationSchema.parse(message.payload);
        const recipient = input.recipient ?? this.config.defaultRecipient;
        if (!recipient) {
          context.logger.warn("Notification has no recipient");
          return { success: false, error: "Notification recipient missing" };
        }

        // Resolve a transport by the recipient's channel type. This plugin
        // never names a transport, so a new one becomes available by
        // registering a delivery provider — no change here.
        const provider = context.channels.getDeliveryProvider(recipient.type);
        if (!provider || !(await provider.isAvailable())) {
          context.logger.warn("Notification has no available transport", {
            channelType: recipient.type,
          });
          return { success: false, error: "Notification transport missing" };
        }

        const result = await provider.send({
          recipient: recipient.address,
          subject: input.title,
          text: input.body,
          ...(input.html ? { html: input.html } : {}),
          sensitivity: input.sensitivity,
          // Providers dedupe on this, so mint one when the caller has no
          // natural key rather than leaving retries to double-send.
          idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
        });

        if (result.status !== "sent") {
          return { success: false, error: "Notification delivery failed" };
        }

        const data: SendNotificationResult = result.providerDeliveryId
          ? { status: "sent", deliveryId: result.providerDeliveryId }
          : { status: "sent" };
        return { success: true, data };
      },
    );
  }
}

export function notificationsPlugin(
  config: NotificationsConfigInput = {},
): NotificationsPlugin {
  return new NotificationsPlugin(config);
}
