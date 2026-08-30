import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  EMAIL_SOURCE_READ,
  authPrincipalResolveResponseSchema,
  createExternalActorId,
  emailSourceReadRequestSchema,
  emailSourceReadResponseSchema,
  type EmailSourceReadResponse,
  type InboundEmailSender,
} from "@brains/contracts";
import {
  defineDaemon,
  defineMessageInterface,
  defineSubscription,
  z,
  type IRuntimeStateStore,
} from "@brains/sdk/interfaces";
import { getErrorMessage } from "@brains/utils/error";
import { type FetchLike } from "@brains/utils/fetch-like";
import type { Logger } from "@brains/utils/logger";
import {
  createInboundEmailClient,
  intakeInboundEmail,
  type EmailImapConfig,
  type EmailImapConfigInput,
  type InboundEmailClientFactory,
  type InboundEmailCursor,
  type InboundEmailPublisher,
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
    id: z.string().trim().min(1).max(1_000).optional(),
  });

const emailMessageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
    message: "Email threading identifiers cannot contain controls",
  });

interface EmailDeliveryThreading {
  inReplyTo: string;
  references: string[];
}

const emailDeliveryThreadingSchema: z.ZodType<
  EmailDeliveryThreading,
  EmailDeliveryThreading
> = z.strictObject({
  inReplyTo: emailMessageIdSchema,
  references: z.array(emailMessageIdSchema).max(100),
});

const inboundCursorSchema = z.strictObject({
  mailbox: z.string().min(1),
  uidValidity: z.string().regex(/^[1-9]\d*$/),
  lastUid: z.number().int().nonnegative(),
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
  sensitivity: "normal" | "secret" | undefined,
): boolean {
  return sensitivity !== "normal";
}

export interface EmailInterfaceDependencies {
  fetchImpl?: FetchLike;
  imapClientFactory?: InboundEmailClientFactory;
  inboundSleep?: InboundEmailSleep;
}

interface EmailState {
  readonly fetchImpl: FetchLike;
  readonly imapClientFactory: InboundEmailClientFactory;
  readonly logger: Logger;
  readonly sourceLocators: EmailSourceLocatorStore | undefined;
  readonly supervisor: InboundEmailSupervisor | undefined;
}

async function resolveInboundSender(
  messaging: {
    send(message: { type: string; payload: unknown }): Promise<unknown>;
  },
  address: string,
): Promise<InboundEmailSender | undefined> {
  const response = await messaging.send({
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
  if (
    typeof response !== "object" ||
    response === null ||
    "noop" in response ||
    !("success" in response) ||
    response.success !== true ||
    !("data" in response)
  ) {
    return undefined;
  }

  const resolution = authPrincipalResolveResponseSchema.safeParse(
    response.data,
  );
  const principal = resolution.success ? resolution.data.principal : undefined;
  return principal
    ? {
        personId: principal.personId,
        displayName: principal.displayName,
        permissionLevel: principal.permissionLevel,
      }
    : undefined;
}

async function sendWithResend(
  state: EmailState,
  config: EmailConfig,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string | undefined;
    threading?: EmailDeliveryThreading | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<EmailSendResult> {
  const { apiKey, from } = config;
  if (!apiKey || !from) return { status: "failed" };

  const response = await state.fetchImpl("https://api.resend.com/emails", {
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

  if (!response.ok) throw new Error("Resend email request failed");

  const body = resendEmailResponseSchema.parse(await response.json());
  return body.id ? { status: "sent", id: body.id } : { status: "sent" };
}

async function readSource(
  state: EmailState,
  config: EmailConfig,
  input: unknown,
): Promise<EmailSourceReadResponse> {
  const request = emailSourceReadRequestSchema.safeParse(input);
  if (!request.success || request.data.actor.permissionLevel !== "admin") {
    return { kind: "unavailable" };
  }
  const imap = config.imap;
  if (!imap || !state.sourceLocators) return { kind: "unavailable" };

  try {
    const locator = await state.sourceLocators.resolve(request.data.sourceRef);
    if (!locator) return { kind: "unavailable" };
    const timeout = AbortSignal.timeout(10_000);
    const signal = request.data.signal
      ? AbortSignal.any([request.data.signal, timeout])
      : timeout;
    return emailSourceReadResponseSchema.parse(
      await readEmailSource(imap, state.imapClientFactory, locator, signal),
    );
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Email as a declared message interface.
 *
 * Dependencies are closed over rather than injected through a constructor:
 * the package default-exports `emailInterface()`, and a test calls it with
 * fakes.
 */
export interface EmailInterfacePackage {
  readonly kind: "rizom-plugin-package";
  readonly family: "message-interface";
  readonly id: string;
  readonly config: z.ZodType<EmailConfig, EmailConfigInput>;
}

export function emailInterface(
  dependencies: EmailInterfaceDependencies = {},
): EmailInterfacePackage {
  return defineMessageInterface({
    id: "email",
    config: emailConfigSchema,

    channel: {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
      subjectPattern: {
        source: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
        flags: "i",
      },
      recipient: z.string().min(1),
    },

    // `setup` comes first so its return type is inferred before any slot whose
    // context carries `state`; a destructured parameter above it would resolve
    // that context while the state type is still unknown.
    setup: ({ config, runtimeState, messaging, logger }): EmailState => {
      const fetchImpl = dependencies.fetchImpl ?? fetch;
      const imapClientFactory =
        dependencies.imapClientFactory ?? createInboundEmailClient;

      if (!config.apiKey || !config.from) {
        logger.warn(
          "Email interface transport is disabled because apiKey or from is missing",
        );
      }

      if (!config.imap) {
        return {
          fetchImpl,
          imapClientFactory,
          logger,
          sourceLocators: undefined,
          supervisor: undefined,
        };
      }

      const cursor: IRuntimeStateStore<InboundEmailCursor> = runtimeState({
        namespace: "inbound.uid-cursor",
        schema: inboundCursorSchema,
      });
      const sourceLocators = new EmailSourceLocatorStore(
        runtimeState({
          namespace: "inbound.source-locators",
          schema: emailSourceLocatorSchema,
        }),
      );
      const publish: InboundEmailPublisher = (message) =>
        messaging.send(message);

      const supervisor = new InboundEmailSupervisor({
        config: config.imap,
        createClient: imapClientFactory,
        intake: async (client, selection): Promise<number> =>
          intakeInboundEmail(client, selection, {
            cursor,
            publish,
            resolveSender: async (address) =>
              resolveInboundSender(messaging, address),
            recordSourceLocator: async (sourceRef, sel, uid) =>
              sourceLocators.record(sourceRef, sel, uid),
            pruneSourceLocators: async () => sourceLocators.prune(),
            logger,
          }),
        logger,
        ...(dependencies.inboundSleep
          ? { sleep: dependencies.inboundSleep }
          : {}),
      });

      return {
        fetchImpl,
        imapClientFactory,
        logger,
        sourceLocators,
        supervisor,
      };
    },

    // An inbound-only posture has no key and must still boot; it registers the
    // channel and simply cannot be delivered to.
    available: ({ config }) => Boolean(config.apiKey && config.from),

    daemons: ({ state }) =>
      state.supervisor
        ? [
            defineDaemon({
              id: "inbound",
              required: false,
              // Connected or reconnecting is a fact about now, and only the
              // supervisor knows it.
              check: () => {
                const supervisor = state.supervisor;
                const connected = supervisor?.isConnected() ?? false;
                return {
                  status: connected ? "healthy" : "error",
                  message: connected
                    ? "Inbound email listener connected"
                    : supervisor?.isRunning()
                      ? "Inbound email listener awaiting connection"
                      : "Inbound email listener disconnected",
                };
              },
              async run({ signal, health }) {
                const supervisor = state.supervisor;
                if (!supervisor) return;
                try {
                  await supervisor.start();
                } catch {
                  throw new Error("Inbound email listener failed to start");
                }
                state.logger.info(
                  supervisor.isConnected()
                    ? "Inbound email listener connected"
                    : "Inbound email listener started; awaiting connection",
                );
                health.ready();
                await new Promise<void>((resolve) => {
                  signal.addEventListener("abort", () => resolve(), {
                    once: true,
                  });
                });
                try {
                  await supervisor.stop();
                } catch {
                  throw new Error(
                    "Inbound email listener failed to disconnect",
                  );
                }
                state.logger.info("Inbound email listener disconnected");
              },
            }),
          ]
        : [],

    // The interface that delivered a message is the only thing that can fetch
    // it back, so something has to be able to ask.
    subscriptions: ({ config, state }) =>
      state.sourceLocators
        ? [
            defineSubscription({
              topic: EMAIL_SOURCE_READ,
              payload: z.unknown(),
              handle: ({ payload }) => readSource(state, config, payload),
            }),
          ]
        : [],

    deliver: async ({ config, state, recipient, delivery }) => {
      const secret = shouldRedactDelivery(delivery.sensitivity);
      try {
        const result = await sendWithResend(state, config, {
          to: recipient,
          subject: delivery.subject,
          text: delivery.text,
          ...(delivery.html ? { html: delivery.html } : {}),
          ...(delivery.threading
            ? {
                threading: emailDeliveryThreadingSchema.parse(
                  delivery.threading,
                ),
              }
            : {}),
          idempotencyKey: delivery.idempotencyKey,
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
      } catch (error) {
        if (secret) {
          state.logger.warn("Email delivery failed for a secret message");
        } else {
          state.logger.warn("Email delivery failed", {
            to: recipient,
            subject: delivery.subject,
            error: getErrorMessage(error),
          });
        }
        return {
          status: "failed" as const,
          failureCode: "email_delivery_failed",
        };
      }
    },
  });
}

const emailPackage: EmailInterfacePackage = emailInterface();
export default emailPackage;
