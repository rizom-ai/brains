import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/** How notifications logs a refusal; senders read the answer's `failure` instead. */
export const NOTIFICATION_FAILURES: {
  readonly recipientMissing: "Notification recipient missing";
  readonly transportMissing: "Notification transport missing";
  readonly deliveryFailed: "Notification delivery failed";
} = {
  recipientMissing: "Notification recipient missing",
  transportMissing: "Notification transport missing",
  deliveryFailed: "Notification delivery failed",
};

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

/** Why a notification was not sent: a refusal is an answer, not a failure. */
export const notificationFailureSchema: z.ZodEnum<{
  "recipient-missing": "recipient-missing";
  "transport-missing": "transport-missing";
  "delivery-failed": "delivery-failed";
}> = z.enum(["recipient-missing", "transport-missing", "delivery-failed"]);

export type NotificationFailure = z.output<typeof notificationFailureSchema>;

/** A transport's own short failure code: no message content, so it can be kept and shown. */
export const notificationTransportCodeSchema: z.ZodString = z
  .string()
  .regex(/^[a-z0-9_:.-]{1,80}$/u);

type SendNotificationResultSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { status: z.ZodLiteral<"sent">; deliveryId: z.ZodOptional<z.ZodString> },
      z.core.$strict
    >,
    z.ZodObject<
      {
        status: z.ZodLiteral<"failed">;
        failure: typeof notificationFailureSchema;
        transportCode: z.ZodOptional<typeof notificationTransportCodeSchema>;
      },
      z.core.$strict
    >,
  ]
>;

export const sendNotificationResultSchema: SendNotificationResultSchema =
  z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("sent"),
      deliveryId: z.string().optional(),
    }),
    z.strictObject({
      status: z.literal("failed"),
      failure: notificationFailureSchema,
      transportCode: notificationTransportCodeSchema.optional(),
    }),
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

/** Deliver a notification to its recipient; the notifications plugin owns it. */
export const notificationsSendContract: BusContract<
  SendNotificationSchema,
  SendNotificationResultSchema,
  "request"
> = defineBusContract({
  channel: "notifications:send",
  request: sendNotificationSchema,
  response: sendNotificationResultSchema,
  delivery: "request",
});
