import {
  EMAIL_SEND,
  sendEmailPayloadSchema,
  type SendEmailPayload,
  type SendEmailResult,
} from "@brains/email-contracts";
import type { ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { type FetchLike, z } from "@brains/utils";
import packageJson from "../package.json";

const emailResendConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
});

type EmailResendConfig = z.infer<typeof emailResendConfigSchema>;

export type EmailSendResult = SendEmailResult;

export interface EmailResendPluginDependencies {
  fetchImpl?: FetchLike;
}

export class EmailResendPlugin extends ServicePlugin<EmailResendConfig> {
  private readonly fetchImpl: FetchLike;

  constructor(
    config: Partial<EmailResendConfig> = {},
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

    context.messaging.subscribe<SendEmailPayload, EmailSendResult>(
      EMAIL_SEND,
      async (message) => {
        const input = sendEmailPayloadSchema.parse(message.payload);

        try {
          const result = await this.sendWithResend(input);
          return { success: true, data: result };
        } catch {
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

    const body = (await response.json()) as { id?: string };
    return body.id ? { status: "sent", id: body.id } : { status: "sent" };
  }
}

export function emailResendPlugin(
  config: Partial<EmailResendConfig> = {},
): EmailResendPlugin {
  return new EmailResendPlugin(config);
}
