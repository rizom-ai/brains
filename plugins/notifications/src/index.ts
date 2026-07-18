import {
  EMAIL_SEND,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
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

        const emailPayload: SendEmailPayload = {
          to: recipient.address,
          subject: input.title,
          text: input.body,
          ...(input.html ? { html: input.html } : {}),
          sensitivity: input.sensitivity,
        };
        const response = await context.messaging.send<
          SendEmailPayload,
          SendEmailResult
        >({
          type: EMAIL_SEND,
          payload: emailPayload,
        });

        if (!("success" in response) || !response.success || !response.data) {
          return { success: false, error: "Notification delivery failed" };
        }

        const emailResult = response.data;
        if (emailResult.status !== "sent") {
          return { success: false, error: "Notification delivery failed" };
        }

        const data: SendNotificationResult = emailResult.id
          ? { status: "sent", deliveryId: emailResult.id }
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
