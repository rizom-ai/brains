import {
  EMAIL_SEND,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import packageJson from "../package.json";

export const OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL =
  "operator-notifications:send-transactional";

const operatorNotificationsConfigSchema = z.object({});

const sendTransactionalNotificationSchema = z
  .object({
    channel: z.literal("email"),
    to: z.string().email(),
    subject: z.string().min(1),
    text: z.string().min(1),
    html: z.string().min(1).optional(),
    sensitivity: z.enum(["normal", "secret"]).default("normal"),
    dedupeKey: z.string().min(1).optional(),
  })
  .strict();

type OperatorNotificationsConfig = z.infer<
  typeof operatorNotificationsConfigSchema
>;

export type SendTransactionalNotificationInput = z.infer<
  typeof sendTransactionalNotificationSchema
>;

export type SendTransactionalNotificationResult =
  | { status: "sent"; deliveryId?: string }
  | { status: "duplicate" };

export class OperatorNotificationsPlugin extends ServicePlugin<OperatorNotificationsConfig> {
  private readonly deliveredDedupeKeys = new Set<string>();

  constructor(config: Partial<OperatorNotificationsConfig> = {}) {
    super(
      "operator-notifications",
      packageJson,
      config,
      operatorNotificationsConfigSchema,
    );
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.messaging.subscribe<
      SendTransactionalNotificationInput,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, async (message) => {
      const input = sendTransactionalNotificationSchema.parse(message.payload);

      if (
        input.dedupeKey !== undefined &&
        this.deliveredDedupeKeys.has(input.dedupeKey)
      ) {
        return { success: true, data: { status: "duplicate" } };
      }

      const emailPayload: SendEmailPayload = {
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
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

      if (input.dedupeKey !== undefined) {
        this.deliveredDedupeKeys.add(input.dedupeKey);
      }

      const data: SendTransactionalNotificationResult = emailResult.id
        ? { status: "sent", deliveryId: emailResult.id }
        : { status: "sent" };
      return { success: true, data };
    });
  }
}

export function operatorNotificationsPlugin(
  config: Partial<OperatorNotificationsConfig> = {},
): OperatorNotificationsPlugin {
  return new OperatorNotificationsPlugin(config);
}
