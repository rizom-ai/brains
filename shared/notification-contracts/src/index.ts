import { z } from "@brains/utils/zod";

export const NOTIFICATIONS_SEND = "notifications:send" as const;

export type NotificationSensitivity = "normal" | "secret";

export interface EmailNotificationRecipient {
  type: "email";
  address: string;
}

export type NotificationRecipient = EmailNotificationRecipient;

export interface SendNotificationInput {
  /** Uses the notifications plugin's default recipient when omitted. */
  recipient?: NotificationRecipient | undefined;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity?: NotificationSensitivity | undefined;
}

export interface ParsedSendNotification {
  recipient?: NotificationRecipient | undefined;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity: NotificationSensitivity;
}

export type SendNotificationResult =
  { status: "sent"; deliveryId?: string | undefined } | { status: "failed" };

export const notificationRecipientSchema: z.ZodType<
  NotificationRecipient,
  NotificationRecipient
> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("email"),
    address: z.email(),
  }),
]);

export const sendNotificationSchema: z.ZodType<
  ParsedSendNotification,
  SendNotificationInput
> = z.strictObject({
  recipient: notificationRecipientSchema.optional(),
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
