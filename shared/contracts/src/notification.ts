import { z } from "@brains/utils/zod";

export const NOTIFICATIONS_SEND = "notifications:send" as const;

export type NotificationSensitivity = "normal" | "secret";

interface EmailNotificationRecipientValue {
  type: "email";
  address: string;
}

type NotificationRecipientValue = EmailNotificationRecipientValue;

interface SendNotificationInputValue {
  /** Uses the notifications plugin's default recipient when omitted. */
  recipient?: NotificationRecipientValue | undefined;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity?: NotificationSensitivity | undefined;
  idempotencyKey?: string | undefined;
}

interface ParsedSendNotificationValue {
  recipient?: NotificationRecipientValue | undefined;
  title: string;
  body: string;
  html?: string | undefined;
  sensitivity: NotificationSensitivity;
  idempotencyKey?: string | undefined;
}

type SendNotificationResultValue =
  { status: "sent"; deliveryId?: string | undefined } | { status: "failed" };

export const notificationRecipientSchema: z.ZodType<
  NotificationRecipientValue,
  NotificationRecipientValue
> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("email"),
    address: z.email(),
  }),
]);

export const sendNotificationSchema: z.ZodType<
  ParsedSendNotificationValue,
  SendNotificationInputValue
> = z.strictObject({
  recipient: notificationRecipientSchema.optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export const sendNotificationResultSchema: z.ZodType<
  SendNotificationResultValue,
  SendNotificationResultValue
> = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("sent"),
    deliveryId: z.string().optional(),
  }),
  z.strictObject({ status: z.literal("failed") }),
]);

export type NotificationRecipient = z.output<
  typeof notificationRecipientSchema
>;
export type EmailNotificationRecipient = NotificationRecipient;
export type SendNotificationInput = z.input<typeof sendNotificationSchema>;
export type ParsedSendNotification = z.output<typeof sendNotificationSchema>;
export type SendNotificationResult = z.output<
  typeof sendNotificationResultSchema
>;
