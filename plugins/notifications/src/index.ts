import {
  EMAIL_SEND,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z as zConfig } from "@brains/utils/zod";
import { z } from "@brains/utils/zod-v4";
import packageJson from "../package.json";

export const NOTIFICATIONS_SEND = "notifications:send";

const notificationsConfigSchema = zConfig.object({});

const notificationRecipientSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("email"),
    address: z.string().email(),
  }),
]);

const sendNotificationSchema = z.strictObject({
  recipient: notificationRecipientSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
});

type NotificationsConfig = zConfig.output<typeof notificationsConfigSchema>;
type NotificationsConfigInput = zConfig.input<typeof notificationsConfigSchema>;

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

export const sendNotificationResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("sent"),
    deliveryId: z.string().optional(),
  }),
  z.strictObject({ status: z.literal("failed") }),
]);

export type SendNotificationResult = z.infer<
  typeof sendNotificationResultSchema
>;

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

        const emailPayload: SendEmailPayload = {
          to: input.recipient.address,
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
