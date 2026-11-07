import {
  NOTIFICATION_FAILURES,
  notificationTransportCodeSchema,
  notificationRecipientSchema,
  notificationsSendContract,
  type SendNotificationResult,
} from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

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
    // Durable jobs need the same internal transport resolution in worker roles.
    context.messaging.answer(
      notificationsSendContract,
      async (input): Promise<SendNotificationResult> => {
        const recipient = input.recipient ?? this.config.defaultRecipient;
        // A refusal is an answer the sender acts on, not a failure: it
        // arrives as data. A fault in a transport still throws.
        if (!recipient) {
          context.logger.warn(NOTIFICATION_FAILURES.recipientMissing);
          return { status: "failed", failure: "recipient-missing" };
        }

        // Resolve a transport by the recipient's channel type. This plugin
        // never names a transport, so a new one becomes available by
        // registering a delivery provider — no change here.
        const provider = context.channels.getDeliveryProvider(recipient.type);
        if (!provider || !(await provider.isAvailable())) {
          context.logger.warn(NOTIFICATION_FAILURES.transportMissing, {
            channelType: recipient.type,
          });
          return { status: "failed", failure: "transport-missing" };
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
          // The transport's failure code names the cause; it carries no message content.
          context.logger.warn(NOTIFICATION_FAILURES.deliveryFailed, {
            transportCode: result.failureCode,
          });
          // A code outside the contract's vocabulary is left out rather than
          // passed on as free text.
          const transportCode = notificationTransportCodeSchema.safeParse(
            result.failureCode,
          );
          return {
            status: "failed",
            failure: "delivery-failed",
            ...(transportCode.success && { transportCode: transportCode.data }),
          };
        }

        return result.providerDeliveryId
          ? { status: "sent", deliveryId: result.providerDeliveryId }
          : { status: "sent" };
      },
      { everyProcess: true },
    );
  }
}

export function notificationsPlugin(
  config: NotificationsConfigInput = {},
): NotificationsPlugin {
  return new NotificationsPlugin(config);
}
