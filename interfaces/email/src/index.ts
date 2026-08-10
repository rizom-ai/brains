import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveResponseSchema,
  createExternalActorId,
  type InboundEmailSender,
} from "@brains/contracts";
import {
  MessageInterfacePlugin,
  type ChannelDeliveryInput,
  type Daemon,
  type IRuntimeStateStore,
  type MessageInterfacePluginContext,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { type FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import {
  createInboundEmailClient,
  intakeInboundEmail,
  type EmailImapConfig,
  type EmailImapConfigInput,
  type InboundEmailClientFactory,
  type InboundEmailCursor,
} from "./inbound-email";
import {
  InboundEmailSupervisor,
  type InboundEmailSleep,
} from "./inbound-supervisor";

export {
  EMAIL_INBOUND,
  inboundEmailSchema,
  type InboundEmail,
  type InboundEmailAddress,
  type InboundEmailSender,
} from "@brains/contracts";
export type {
  EmailImapConfig,
  EmailImapConfigInput,
  InboundEmailClient,
  InboundEmailClientFactory,
  InboundEmailCursor,
  InboundEmailSelection,
  InboundEmailSourceMessage,
} from "./inbound-email";
export { createInboundEmailSourceRef } from "./inbound-email";
export type { InboundEmailSleep } from "./inbound-supervisor";

export interface EmailConfig {
  transport: "resend";
  apiKey?: string | undefined;
  from?: string | undefined;
  imap?: EmailImapConfig | undefined;
}

export interface EmailConfigInput {
  transport?: "resend" | undefined;
  apiKey?: string | undefined;
  from?: string | undefined;
  imap?: EmailImapConfigInput | undefined;
}

interface ResendEmailResponse {
  id?: string | undefined;
}

const emailImapConfigSchema: z.ZodType<EmailImapConfig, EmailImapConfigInput> =
  z.object({
    host: z.string().min(1),
    port: z.coerce.number<number | string>().int().min(1).max(65_535),
    user: z.string().min(1),
    password: z.string().min(1),
    mailbox: z.string().min(1).default("INBOX"),
    pollMode: z.enum(["idle", "interval"]).default("idle"),
    pollIntervalMs: z.coerce
      .number<number | string>()
      .int()
      .positive()
      .default(60_000),
  });

// Unset env vars interpolate to empty strings in brain.yaml; an optional
// outbound setting left empty means "absent", not invalid — inbound-only
// postures must still boot.
const optionalConfigString = z
  .string()
  .max(0)
  .transform((): undefined => undefined)
  .or(z.string().min(1))
  .optional();

const emailConfigSchema: z.ZodType<EmailConfig, EmailConfigInput> = z.object({
  transport: z.literal("resend").default("resend"),
  apiKey: optionalConfigString,
  from: optionalConfigString,
  imap: emailImapConfigSchema.optional(),
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
  imapClientFactory?: InboundEmailClientFactory;
  inboundSleep?: InboundEmailSleep;
}

/** Email message interface with Resend delivery and optional IMAP intake. */
export class EmailInterface extends MessageInterfacePlugin<
  EmailConfig,
  EmailConfigInput
> {
  private readonly fetchImpl: FetchLike;
  private readonly imapClientFactory: InboundEmailClientFactory;
  private readonly inboundSleep: InboundEmailSleep | undefined;
  private inboundCursor?: IRuntimeStateStore<InboundEmailCursor>;

  constructor(
    config: EmailConfigInput = {},
    dependencies: EmailInterfaceDependencies = {},
  ) {
    super("email", packageJson, config, emailConfigSchema);
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.imapClientFactory =
      dependencies.imapClientFactory ?? createInboundEmailClient;
    this.inboundSleep = dependencies.inboundSleep;
  }

  protected override createDaemon(): Daemon | undefined {
    const config = this.config.imap;
    if (!config) return undefined;

    const supervisor = new InboundEmailSupervisor({
      config,
      createClient: this.imapClientFactory,
      intake: async (client, selection): Promise<number> =>
        intakeInboundEmail(client, selection, {
          cursor: this.getInboundCursor(),
          publish: this.getContext().messaging.send,
          resolveSender: async (
            address,
          ): Promise<InboundEmailSender | undefined> =>
            this.resolveInboundSender(address),
          logger: this.logger,
        }),
      logger: this.logger,
      ...(this.inboundSleep ? { sleep: this.inboundSleep } : {}),
    });

    return {
      start: async (): Promise<void> => {
        try {
          await supervisor.start();
          this.logger.info(
            supervisor.isConnected()
              ? "Inbound email listener connected"
              : "Inbound email listener started; awaiting connection",
          );
        } catch {
          throw new Error("Inbound email listener failed to start");
        }
      },
      stop: async (): Promise<void> => {
        try {
          await supervisor.stop();
          this.logger.info("Inbound email listener disconnected");
        } catch {
          throw new Error("Inbound email listener failed to disconnect");
        }
      },
      healthCheck: async () => ({
        status: supervisor.isConnected() ? "healthy" : "error",
        message: supervisor.isConnected()
          ? "Inbound email listener connected"
          : supervisor.isRunning()
            ? "Inbound email listener awaiting connection"
            : "Inbound email listener disconnected",
        lastCheck: new Date(),
      }),
    };
  }

  protected override async onRegister(
    context: MessageInterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (this.config.imap) {
      this.inboundCursor = context.runtimeState.scoped({
        namespace: "email.inbound.uid-cursor",
        schema: z.strictObject({
          mailbox: z.string().min(1),
          uidValidity: z.string().regex(/^[1-9]\d*$/),
          lastUid: z.number().int().nonnegative(),
        }),
      });
    }
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

  private async resolveInboundSender(
    address: string,
  ): Promise<InboundEmailSender | undefined> {
    const response = await this.getContext().messaging.send({
      type: AUTH_PRINCIPAL_RESOLVE_CHANNEL,
      payload: {
        actor: {
          kind: "external",
          externalActorId: createExternalActorId(
            "email",
            address.trim().toLowerCase(),
          ),
        },
      },
    });
    if ("noop" in response || !response.success) return undefined;

    const resolution = authPrincipalResolveResponseSchema.safeParse(
      response.data,
    );
    const principal = resolution.success
      ? resolution.data.principal
      : undefined;
    return principal
      ? {
          personId: principal.personId,
          displayName: principal.displayName,
          permissionLevel: principal.permissionLevel,
        }
      : undefined;
  }

  private getInboundCursor(): IRuntimeStateStore<InboundEmailCursor> {
    if (!this.inboundCursor) {
      throw new Error("Inbound email cursor is unavailable");
    }
    return this.inboundCursor;
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
