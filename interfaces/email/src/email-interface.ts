import {
  authPrincipalResolveContract,
  createExternalActorId,
  emailSourceReadContract,
  inboundEmailContract,
  type EmailSourceReadRequest,
  type EmailSourceReadResponse,
  type InboundEmailSender,
} from "@brains/contracts";
import {
  interfaceRuntime,
  withChannels,
  withDaemon,
  type FirstPartySlotContext,
  type InterfaceRuntime,
  type ChannelDeliveryInput,
  type DaemonHealth,
  type ClassRuntimeStateStore,
} from "@brains/sdk/internal/interface-runtime";
import type { PluginPackageDefinition } from "@brains/sdk";
import { defineInterface } from "@brains/sdk/interfaces";
import { getErrorMessage } from "@brains/utils/error";
import { type FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";
import {
  createInboundEmailClient,
  intakeInboundEmail,
  emailImapConfigSchema,
  type EmailImapConfig,
  type InboundEmailClientFactory,
  type InboundEmailCursor,
  inboundEmailCursorSchema,
} from "./inbound-email";
import {
  InboundEmailSupervisor,
  type InboundEmailSleep,
} from "./inbound-supervisor";
import {
  EmailSourceLocatorStore,
  emailSourceLocatorSchema,
} from "./source-locator-store";
import { readEmailSource } from "./source-reader";

// Unset env vars interpolate to empty strings in brain.yaml; an optional
// outbound setting left empty means "absent", not invalid — inbound-only
// postures must still boot.
const optionalConfigString: z.ZodOptional<
  z.ZodUnion<
    [z.ZodPipe<z.ZodString, z.ZodTransform<undefined, string>>, z.ZodString]
  >
> = z
  .string()
  .max(0)
  .transform((): undefined => undefined)
  .or(z.string().min(1))
  .optional();

export const emailConfigSchema: z.ZodObject<{
  transport: z.ZodDefault<z.ZodLiteral<"resend">>;
  apiKey: typeof optionalConfigString;
  from: typeof optionalConfigString;
  imap: z.ZodOptional<typeof emailImapConfigSchema>;
}> = z.object({
  transport: z.literal("resend").default("resend"),
  apiKey: optionalConfigString,
  from: optionalConfigString,
  imap: emailImapConfigSchema.optional(),
});

export type EmailConfig = z.output<typeof emailConfigSchema>;
export type EmailConfigInput = z.input<typeof emailConfigSchema>;

const resendEmailResponseSchema: z.ZodObject<
  { id: z.ZodOptional<z.ZodString> },
  z.core.$loose
> = z.looseObject({
  id: z.string().trim().min(1).max(1_000).optional(),
});

type EmailDeliveryThreading = NonNullable<ChannelDeliveryInput["threading"]>;
const emailMessageIdSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
    message: "Email threading identifiers cannot contain controls",
  });
const emailDeliveryThreadingSchema: z.ZodObject<
  {
    inReplyTo: z.ZodString;
    references: z.ZodArray<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  inReplyTo: emailMessageIdSchema,
  references: z.array(emailMessageIdSchema).max(100),
});

function expectEmailDeliveryThreading(
  value: z.output<typeof emailDeliveryThreadingSchema>,
): EmailDeliveryThreading {
  return value;
}
void expectEmailDeliveryThreading;

function expectEmailDeliveryThreadingInput(
  value: EmailDeliveryThreading,
): z.input<typeof emailDeliveryThreadingSchema> {
  return value;
}
void expectEmailDeliveryThreadingInput;

export type EmailSendResult =
  { status: "sent"; id?: string } | { status: "failed"; code: string };

/** Resend's error name only: its message can name addresses or domains. */
const resendErrorSchema = z.object({
  name: z.string().regex(/^[a-z_]{1,64}$/),
});

async function resendFailureCode(response: Response): Promise<string> {
  const body: unknown = await response.json().catch((): undefined => {
    // A body that is not JSON still has its status.
    return undefined;
  });
  const parsed = resendErrorSchema.safeParse(body);
  return parsed.success
    ? `resend_${parsed.data.name}`
    : `resend_http_${response.status}`;
}

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

/** What a mailbox keeps: the IMAP cursor and where each source can be read. */
interface InboundStores {
  readonly config: EmailImapConfig;
  readonly cursor: ClassRuntimeStateStore<InboundEmailCursor>;
  readonly sourceLocators: EmailSourceLocatorStore;
}

/** The mailbox the interface reads, when it is configured with one. */
interface EmailState {
  readonly inbound: InboundStores | undefined;
}

type EmailSlotContext = FirstPartySlotContext<EmailConfig, EmailState>;

export type EmailInterfaceDefinition = PluginPackageDefinition<
  typeof emailConfigSchema,
  "interface"
>;

/**
 * The Email interface: the email channel and its Resend sender, and, with a
 * mailbox, the IMAP listener that hands inbound mail to the brain and the
 * source reads an Admin asks for. The collaborators default to the real
 * ones; a test hands its own.
 */
export function createEmailInterface(
  dependencies: EmailInterfaceDependencies = {},
): EmailInterfaceDefinition {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const imapClientFactory =
    dependencies.imapClientFactory ?? createInboundEmailClient;
  const inboundSleep = dependencies.inboundSleep;

  const email = defineInterface({
    id: "email",
    config: emailConfigSchema,
    setup: (context): EmailState => {
      const imap = context.config.imap;
      if (!imap) return { inbound: undefined };
      const runtime = interfaceRuntime(context);
      const inbound: InboundStores = {
        config: imap,
        cursor: runtime.classRuntimeState.scoped({
          namespace: "email.inbound.uid-cursor",
          schema: inboundEmailCursorSchema,
        }),
        sourceLocators: new EmailSourceLocatorStore(
          runtime.classRuntimeState.scoped({
            namespace: "email.inbound.source-locators",
            schema: emailSourceLocatorSchema,
          }),
        ),
      };
      runtime.answer(emailSourceReadContract, async ({ request }) =>
        readSource(inbound, imapClientFactory, request),
      );
      return { inbound };
    },
  });

  /** The IMAP listener, email:email, when the interface has a mailbox. */
  const withListener = withDaemon(email, (context: EmailSlotContext) => {
    const { inbound } = context.state;
    if (!inbound) return undefined;
    const runtime = interfaceRuntime(context);
    const { logger } = runtime;
    const supervisor = new InboundEmailSupervisor({
      config: inbound.config,
      createClient: imapClientFactory,
      intake: async (client, selection): Promise<number> =>
        intakeInboundEmail(client, selection, {
          cursor: inbound.cursor,
          publish: async (message) =>
            runtime.request(inboundEmailContract, message),
          resolveSender: async (
            address,
          ): Promise<InboundEmailSender | undefined> =>
            resolveInboundSender(runtime, address),
          recordSourceLocator: async (sourceRef, mailbox, uid) =>
            inbound.sourceLocators.record(sourceRef, mailbox, uid),
          pruneSourceLocators: async () => inbound.sourceLocators.prune(),
          logger,
        }),
      logger,
      ...(inboundSleep ? { sleep: inboundSleep } : {}),
    });

    return {
      id: "email",
      start: async (): Promise<void> => {
        try {
          await supervisor.start();
          logger.info(
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
          logger.info("Inbound email listener disconnected");
        } catch {
          throw new Error("Inbound email listener failed to disconnect");
        }
      },
      healthCheck: async (): Promise<DaemonHealth> => ({
        status: supervisor.isConnected() ? "healthy" : "error",
        message: supervisor.isConnected()
          ? "Inbound email listener connected"
          : supervisor.isRunning()
            ? "Inbound email listener awaiting connection"
            : "Inbound email listener disconnected",
        lastCheck: new Date(),
      }),
    };
  });

  /**
   * The Email channel and its Resend sender. Registered in the worker too,
   * so contact alerts and other background jobs can send email.
   */
  return withChannels(withListener, (context) => {
    const { config } = context;
    const descriptor = {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
      subjectPattern: {
        source: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
        flags: "i",
      },
      manualDelivery: true,
    };
    if (!config.apiKey || !config.from) {
      interfaceRuntime(context).logger.warn(
        "Email interface transport is disabled because apiKey or from is missing",
      );
      return [{ descriptor }];
    }
    const { logger } = interfaceRuntime(context);
    const resend = { apiKey: config.apiKey, from: config.from, fetchImpl };
    // The one way to send email. Senders resolve this provider by channel
    // type rather than publishing to a transport-specific channel, so they
    // never need to know the transport exists.
    return [
      {
        descriptor,
        delivery: {
          isAvailable: async (): Promise<boolean> => true,
          send: async (input: ChannelDeliveryInput) =>
            deliver(resend, logger, input),
        },
      },
    ];
  });
}

async function resolveInboundSender(
  runtime: InterfaceRuntime,
  address: string,
): Promise<InboundEmailSender | undefined> {
  const resolution = await runtime.request(authPrincipalResolveContract, {
    actor: {
      kind: "external",
      externalActorId: createExternalActorId(
        "email",
        address.trim().toLowerCase(),
      ),
    },
  });
  const principal =
    resolution.status === "answered" ? resolution.data.principal : undefined;
  return principal
    ? {
        personId: principal.personId,
        displayName: principal.displayName,
        permissionLevel: principal.permissionLevel,
      }
    : undefined;
}

async function readSource(
  inbound: InboundStores,
  imapClientFactory: InboundEmailClientFactory,
  request: EmailSourceReadRequest,
): Promise<EmailSourceReadResponse> {
  if (request.actor.permissionLevel !== "admin") {
    return { kind: "unavailable" };
  }

  try {
    const locator = await inbound.sourceLocators.resolve(request.sourceRef);
    if (!locator) return { kind: "unavailable" };
    const timeout = AbortSignal.timeout(10_000);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
    // readEmailSource parses its own success path and returns
    // EmailSourceReadResponse, which is z.output of this same schema — so
    // the compiler already guarantees the shape and re-parsing here only
    // re-trims strings that were trimmed one call ago.
    return await readEmailSource(
      inbound.config,
      imapClientFactory,
      locator,
      signal,
    );
  } catch {
    // One fixed outcome for every failure: a caller must not learn from
    // it whether the message exists or the mailbox refused us.
    return { kind: "unavailable" };
  }
}

interface ResendTransport {
  readonly apiKey: string;
  readonly from: string;
  readonly fetchImpl: FetchLike;
}

async function deliver(
  resend: ResendTransport,
  logger: InterfaceRuntime["logger"],
  input: ChannelDeliveryInput,
): Promise<
  | { status: "sent"; providerDeliveryId?: string }
  | {
      status: "failed";
      failureCode: string;
    }
> {
  const secret = shouldRedactDelivery(input.sensitivity);

  try {
    const result = await sendWithResend(resend, {
      to: input.recipient,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.threading
        ? { threading: emailDeliveryThreadingSchema.parse(input.threading) }
        : {}),
      // An address only: never a header line of its own.
      ...(input.replyTo ? { replyTo: z.email().parse(input.replyTo) } : {}),
      idempotencyKey: input.idempotencyKey,
    });
    if (result.status === "sent")
      return {
        status: "sent" as const,
        ...(result.id ? { providerDeliveryId: result.id } : {}),
      };
    logger.warn(
      secret
        ? "Email delivery failed for a secret message"
        : "Email delivery failed",
      {
        failureCode: result.code,
        ...(secret ? {} : { to: input.recipient, subject: input.subject }),
      },
    );
    return { status: "failed" as const, failureCode: result.code };
  } catch (error) {
    if (secret) {
      logger.warn("Email delivery failed for a secret message");
    } else {
      logger.warn("Email delivery failed", {
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

async function sendWithResend(
  resend: ResendTransport,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string | undefined;
    threading?: EmailDeliveryThreading | undefined;
    replyTo?: string | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<EmailSendResult> {
  const response = await resend.fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: resend.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.threading
        ? {
            headers: {
              "In-Reply-To": input.threading.inReplyTo,
              References: input.threading.references.join(" "),
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    return { status: "failed", code: await resendFailureCode(response) };
  }

  const body = resendEmailResponseSchema.parse(await response.json());
  return body.id ? { status: "sent", id: body.id } : { status: "sent" };
}
