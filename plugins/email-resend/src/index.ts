import {
  EMAIL_SEND,
  sendEmailPayloadSchema,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { type FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

interface EmailResendConfig {
  apiKey?: string | undefined;
  from?: string | undefined;
}

type EmailResendConfigInput = EmailResendConfig;

interface ResendEmailResponse {
  id?: string | undefined;
}

const emailResendConfigSchema: z.ZodType<
  EmailResendConfig,
  EmailResendConfigInput
> = z.object({
  apiKey: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
});

const resendEmailResponseSchema: z.ZodType<ResendEmailResponse, unknown> =
  z.looseObject({
    id: z.string().optional(),
  });

export type EmailSendResult = SendEmailResult;

export interface EmailResendPluginDependencies {
  fetchImpl?: FetchLike;
}

export class EmailResendPlugin extends ServicePlugin<
  EmailResendConfig,
  EmailResendConfigInput
> {
  private readonly fetchImpl: FetchLike;

  constructor(
    config: EmailResendConfigInput = {},
    dependencies: EmailResendPluginDependencies = {},
  ) {
    super("email-resend", packageJson, config, emailResendConfigSchema);
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.config.apiKey || !this.config.from) {
      this.logger.warn(
        "Email Resend adapter is disabled because apiKey or from is missing",
      );
      return;
    }

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
              error: error instanceof Error ? error.message : String(error),
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

export function emailResendPlugin(
  config: EmailResendConfigInput = {},
): EmailResendPlugin {
  return new EmailResendPlugin(config);
}
