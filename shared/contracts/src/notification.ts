import { z } from "@brains/utils/zod";

export const NOTIFICATIONS_SEND = "notifications:send" as const;

/** Why notifications:send refused: its response error, stable for senders to read. */
export const NOTIFICATION_FAILURES: {
  readonly recipientMissing: "Notification recipient missing";
  readonly transportMissing: "Notification transport missing";
  readonly deliveryFailed: "Notification delivery failed";
} = {
  recipientMissing: "Notification recipient missing",
  transportMissing: "Notification transport missing",
  deliveryFailed: "Notification delivery failed",
};

const TRANSPORT_FAILURE = new RegExp(
  `^${NOTIFICATION_FAILURES.deliveryFailed}: ([a-z0-9_:.-]{1,80})$`,
);

/**
 * A refusal as a short code: the transport's own code after a failed delivery.
 * Free text never becomes a code, so it can be kept and shown.
 */
export function notificationFailureCode(error: string | undefined): string {
  if (error === NOTIFICATION_FAILURES.recipientMissing)
    return "recipient-missing";
  if (error === NOTIFICATION_FAILURES.transportMissing)
    return "transport-missing";
  if (error?.startsWith(NOTIFICATION_FAILURES.deliveryFailed))
    return TRANSPORT_FAILURE.exec(error)?.[1] ?? "delivery-failed";
  return "unconfirmed";
}

type NotificationRecipientSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { type: z.ZodLiteral<"email">; address: z.ZodEmail },
      z.core.$strict
    >,
  ]
>;

export const notificationRecipientSchema: NotificationRecipientSchema =
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("email"),
      address: z.email(),
    }),
  ]);

type SendNotificationSchema = z.ZodObject<
  {
    recipient: z.ZodOptional<NotificationRecipientSchema>;
    title: z.ZodString;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    sensitivity: z.ZodDefault<
      z.ZodEnum<{ normal: "normal"; secret: "secret" }>
    >;
    idempotencyKey: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;

export const sendNotificationSchema: SendNotificationSchema = z.strictObject({
  /** Uses the notifications plugin's default recipient when omitted. */
  recipient: notificationRecipientSchema.optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

type SendNotificationResultSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { status: z.ZodLiteral<"sent">; deliveryId: z.ZodOptional<z.ZodString> },
      z.core.$strict
    >,
    z.ZodObject<{ status: z.ZodLiteral<"failed"> }, z.core.$strict>,
  ]
>;

export const sendNotificationResultSchema: SendNotificationResultSchema =
  z.discriminatedUnion("status", [
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
export type NotificationSensitivity = ParsedSendNotification["sensitivity"];
export type SendNotificationResult = z.output<
  typeof sendNotificationResultSchema
>;
