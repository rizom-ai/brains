import {
  EMAIL_SEND,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

export const NOTIFICATIONS_SEND = "notifications:send" as const;

type NotificationsConfig = Record<string, unknown>;

type NotificationsConfigInput = NotificationsConfig;

type NotificationSensitivity = "normal" | "secret";

interface EmailNotificationRecipient {
  type: "email";
  address: string;
}

type NotificationRecipient = EmailNotificationRecipient;

export interface SendNotificationInput {
  recipient: NotificationRecipient;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity?: NotificationSensitivity | undefined;
}

interface ParsedSendNotification {
  recipient: NotificationRecipient;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity: NotificationSensitivity;
}

export type SendNotificationResult =
  { status: "sent"; deliveryId?: string | undefined } | { status: "failed" };

const notificationsConfigSchema: z.ZodType<
  NotificationsConfig,
  NotificationsConfigInput
> = z.looseObject({});

const notificationRecipientSchema: z.ZodType<
  NotificationRecipient,
  NotificationRecipient
> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("email"),
    address: z.email(),
  }),
]);

const sendNotificationSchema: z.ZodType<
  ParsedSendNotification,
  SendNotificationInput
> = z.strictObject({
  recipient: notificationRecipientSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
});

export const sendNotificationResultSchema: z.ZodType<
  SendNotificationResult,
  SendNotificationResult
> = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("sent"),
    deliveryId: z.string().optional(),
  }),
  z.strictObject({ status: z.literal("failed") }),
]);

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
