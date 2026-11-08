import {
  NOTIFICATION_FAILURES,
  notificationTransportCodeSchema,
  notificationRecipientSchema,
  notificationsSendContract,
  type SendNotificationResult,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";

// An unset SETUP_EMAIL_TO drops `address` from brain.yaml during env
// interpolation, and deploy tooling may pass it as an empty string. A
// recipient without an address means "no default recipient", not an invalid
// plugin config — alerts then stay pending on the standard retry path.
const emptyRecipient: z.ZodPipe<
  z.ZodObject<{
    type: z.ZodLiteral<"email">;
    address: z.ZodOptional<z.ZodString>;
  }>,
  z.ZodTransform<undefined, { type: "email"; address?: string | undefined }>
> = z
  .object({ type: z.literal("email"), address: z.string().max(0).optional() })
  .transform((): undefined => undefined);

const notificationsConfigSchema: z.ZodObject<
  {
    defaultRecipient: z.ZodOptional<
      z.ZodUnion<[typeof emptyRecipient, typeof notificationRecipientSchema]>
    >;
  },
  z.core.$loose
> = z.looseObject({
  defaultRecipient: emptyRecipient.or(notificationRecipientSchema).optional(),
});

export type NotificationsConfig = z.output<typeof notificationsConfigSchema>;
export type NotificationsConfigInput = z.input<
  typeof notificationsConfigSchema
>;

/**
 * Generic notification routing: delivers a notification to its recipient,
 * or the configured default one, through the transport registered for the
 * recipient's channel type.
 */
const notificationsPackage: ServicePackageDefinition<
  typeof notificationsConfigSchema
> = defineServicePlugin(
  { id: "notifications", config: notificationsConfigSchema },
  {
    subscriptions: (context) => {
      const { config } = context;
      const runtime = serviceRuntime(context);
      const { logger } = runtime;
      // Answered in every process: durable jobs notify from the worker.
      runtime.answer(
        notificationsSendContract,
        async ({ request }): Promise<SendNotificationResult> => {
          const recipient = request.recipient ?? config.defaultRecipient;
          // A refusal is an answer the sender acts on, not a failure: it
          // arrives as data. A fault in a transport still throws.
          if (!recipient) {
            logger.warn(NOTIFICATION_FAILURES.recipientMissing);
            return { status: "failed", failure: "recipient-missing" };
          }

          // Resolve a transport by the recipient's channel type. This plugin
          // never names a transport, so a new one becomes available by
          // registering a delivery provider — no change here.
          const provider = runtime.deliveryProvider(recipient.type);
          if (!provider || !(await provider.isAvailable())) {
            logger.warn(NOTIFICATION_FAILURES.transportMissing, {
              channelType: recipient.type,
            });
            return { status: "failed", failure: "transport-missing" };
          }

          const result = await provider.send({
            recipient: recipient.address,
            subject: request.title,
            text: request.body,
            ...(request.html ? { html: request.html } : {}),
            sensitivity: request.sensitivity,
            // Providers dedupe on this, so mint one when the caller has no
            // natural key rather than leaving retries to double-send.
            idempotencyKey: request.idempotencyKey ?? crypto.randomUUID(),
          });

          if (result.status !== "sent") {
            // The transport's failure code names the cause; it carries no
            // message content.
            logger.warn(NOTIFICATION_FAILURES.deliveryFailed, {
              transportCode: result.failureCode,
            });
            // A code outside the contract's vocabulary is left out rather
            // than passed on as free text.
            const transportCode = notificationTransportCodeSchema.safeParse(
              result.failureCode,
            );
            return {
              status: "failed",
              failure: "delivery-failed",
              ...(transportCode.success && {
                transportCode: transportCode.data,
              }),
            };
          }

          return result.providerDeliveryId
            ? { status: "sent", deliveryId: result.providerDeliveryId }
            : { status: "sent" };
        },
        { everyProcess: true },
      );
      return [];
    },
  },
);

export default notificationsPackage;
