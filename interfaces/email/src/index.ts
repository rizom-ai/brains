import {
  EMAIL_SEND,
  sendEmailPayloadSchema,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import {
  MessageInterfacePlugin,
  type MessageInterfacePluginContext,
} from "@brains/plugins";
import { type FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { getErrorMessage } from "@brains/utils/error";

export interface EmailConfig {
  transport: "resend";
  apiKey?: string | undefined;
  from?: string | undefined;
}

export interface EmailConfigInput {
  transport?: "resend" | undefined;
  apiKey?: string | undefined;
  from?: string | undefined;
}

interface ResendEmailResponse {
  id?: string | undefined;
}

const emailConfigSchema: z.ZodType<EmailConfig, EmailConfigInput> = z.object({
  transport: z.literal("resend").default("resend"),
  apiKey: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
});

const resendEmailResponseSchema: z.ZodType<ResendEmailResponse, unknown> =
  z.looseObject({
    id: z.string().optional(),
  });

export type EmailSendResult = SendEmailResult;

export interface EmailInterfaceDependencies {
  fetchImpl?: FetchLike;
}

/** Outbound-first Email message interface with Resend as its initial transport. */
export class EmailInterface extends MessageInterfacePlugin<
  EmailConfig,
  EmailConfigInput
> {
  private readonly fetchImpl: FetchLike;

  constructor(
    config: EmailConfigInput = {},
    dependencies: EmailInterfaceDependencies = {},
  ) {
    super("email", packageJson, config, emailConfigSchema);
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.channels.registerDescriptor({
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
      subjectPattern: {
        source: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
        flags: "i",
      },
      manualDelivery: true,
    });

    if (!this.config.apiKey || !this.config.from) {
      this.logger.warn(
        "Email interface transport is disabled because apiKey or from is missing",
      );
      return;
    }

    context.channels.registerDeliveryProvider({
      channelType: "email",
      isAvailable: async () => true,
      send: async (input) => {
        try {
          const result = await this.sendWithResend({
            to: input.recipient,
            subject: input.subject,
            text: input.text,
            sensitivity: "secret",
            idempotencyKey: input.idempotencyKey,
          });
          return result.status === "sent"
            ? {
                status: "sent" as const,
                ...(result.id ? { providerDeliveryId: result.id } : {}),
              }
            : {
                status: "failed" as const,
                failureCode: "email_delivery_failed",
              };
        } catch {
          this.logger.warn("Email delivery failed for a secret message");
          return {
            status: "failed" as const,
            failureCode: "email_delivery_failed",
          };
        }
      },
    });

    const logger = this.logger;
    context.messaging.subscribe<SendEmailPayload, EmailSendResult>(
      EMAIL_SEND,
      async (message) => {
        const input = sendEmailPayloadSchema.parse(message.payload);

        try {
          const result = await this.sendWithResend(input);
          return { success: true, data: result };
        } catch (error) {
          if (input.sensitivity === "secret") {
            logger.warn("Email delivery failed for a secret message");
          } else {
            logger.warn("Email delivery failed", {
              to: input.to,
              subject: input.subject,
              error: getErrorMessage(error),
            });
          }
          return { success: false, error: "Email delivery failed" };
        }
      },
    );
  }

  private async sendWithResend(
    input: SendEmailPayload,
  ): Promise<EmailSendResult> {
    const apiKey = this.config.apiKey;
    const from = this.config.from;
    if (!apiKey || !from) {
      return { status: "failed" };
    }

    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error("Resend email request failed");
    }

    const body = resendEmailResponseSchema.parse(await response.json());
    return body.id ? { status: "sent", id: body.id } : { status: "sent" };
  }
}

export function emailInterface(config: EmailConfigInput = {}): EmailInterface {
  return new EmailInterface(config);
}
