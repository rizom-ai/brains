import {
  MessageInterfacePlugin,
  type ChannelDeliveryInput,
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

export type EmailSendResult =
  { status: "sent"; id?: string } | { status: "failed" };

/**
 * Whether a failed delivery must keep recipient and subject out of the logs.
 *
 * Only an explicit "normal" opts out. A caller that never considered
 * sensitivity gets the safe treatment rather than leaking an address.
 */
export function shouldRedactDelivery(
  sensitivity: ChannelDeliveryInput["sensitivity"],
): boolean {
  return sensitivity !== "normal";
}

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

    // The one way to send email. Senders resolve this provider by channel
    // type rather than publishing to a transport-specific channel, so they
    // never need to know the transport exists.
    context.channels.registerDeliveryProvider({
      channelType: "email",
      isAvailable: async () => true,
      send: async (input) => this.deliver(input),
    });
  }

  private async deliver(input: ChannelDeliveryInput): Promise<
    | { status: "sent"; providerDeliveryId?: string }
    | {
        status: "failed";
        failureCode: string;
      }
  > {
    const secret = shouldRedactDelivery(input.sensitivity);

    try {
      const result = await this.sendWithResend({
        to: input.recipient,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        idempotencyKey: input.idempotencyKey,
      });
      return result.status === "sent"
        ? {
            status: "sent" as const,
            ...(result.id ? { providerDeliveryId: result.id } : {}),
          }
        : { status: "failed" as const, failureCode: "email_delivery_failed" };
    } catch (error) {
      if (secret) {
        this.logger.warn("Email delivery failed for a secret message");
      } else {
        this.logger.warn("Email delivery failed", {
          to: input.recipient,
          subject: input.subject,
          error: getErrorMessage(error),
        });
      }
      return {
        status: "failed" as const,
        failureCode: "email_delivery_failed",
      };
    }
  }

  private async sendWithResend(input: {
    to: string;
    subject: string;
    text: string;
    html?: string | undefined;
    idempotencyKey?: string | undefined;
  }): Promise<EmailSendResult> {
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
