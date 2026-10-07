import {
  EMAIL_SOURCE_READ,
  emailSourceReadResponseSchema,
  type EmailSourceReadResponse,
} from "@brains/contracts";
import {
  inboxActorSchema,
  inboxItemIdSchema,
  z,
  type EntityReactionContext,
} from "@brains/sdk/entities";
import type { MailTriageOperatorService } from "./operator-service";

const abortSignalSchema: z.ZodCustom<AbortSignal, AbortSignal> =
  z.custom<AbortSignal>(
    (value) =>
      typeof AbortSignal !== "undefined" && value instanceof AbortSignal,
  );

type EmailWorkflowsSourceReadRequestSchema = z.ZodObject<
  {
    itemId: typeof inboxItemIdSchema;
    actor: typeof inboxActorSchema;
    signal: z.ZodOptional<typeof abortSignalSchema>;
  },
  z.core.$strict
>;

export const emailWorkflowsSourceReadRequestSchema: EmailWorkflowsSourceReadRequestSchema =
  z.strictObject({
    itemId: inboxItemIdSchema,
    actor: inboxActorSchema,
    signal: abortSignalSchema.optional(),
  });

export type EmailWorkflowsSourceReadRequest = z.output<
  typeof emailWorkflowsSourceReadRequestSchema
>;

/** The one way to ask the mail interface for a message: a request it answers. */
export type SourceReadMessaging = Pick<
  EntityReactionContext["messaging"],
  "request"
>;

/**
 * Reads a mail item's original back from the mailbox, for an admin, through
 * the interface that delivered it. Every failure looks the same to the
 * caller: an unreadable source is indistinguishable from an absent one.
 */
export class EmailWorkflowsSourceReader {
  private readonly messaging: SourceReadMessaging;
  private readonly operator: Pick<MailTriageOperatorService, "getSourceRef">;

  constructor(
    messaging: SourceReadMessaging,
    operator: Pick<MailTriageOperatorService, "getSourceRef">,
  ) {
    this.messaging = messaging;
    this.operator = operator;
  }

  async read(input: unknown): Promise<EmailSourceReadResponse> {
    const request = emailWorkflowsSourceReadRequestSchema.safeParse(input);
    if (!request.success || request.data.actor.permissionLevel !== "admin") {
      return { kind: "unavailable" };
    }

    try {
      const sourceRef = await this.operator.getSourceRef(request.data.itemId, {
        userPermissionLevel: request.data.actor.permissionLevel,
      });
      const timeout = AbortSignal.timeout(10_000);
      const signal = request.data.signal
        ? AbortSignal.any([request.data.signal, timeout])
        : timeout;
      const response = await this.messaging.request({
        type: EMAIL_SOURCE_READ,
        payload: {
          sourceRef,
          actor: request.data.actor,
          signal,
        },
      });
      const envelope = z
        .object({ success: z.boolean(), data: z.unknown().optional() })
        .safeParse(response);
      if (!envelope.success || !envelope.data.success) {
        return { kind: "unavailable" };
      }
      const parsed = emailSourceReadResponseSchema.safeParse(
        envelope.data.data,
      );
      return parsed.success ? parsed.data : { kind: "unavailable" };
    } catch {
      // Same fixed outcome as every other failure above: the caller must
      // not be able to tell an unreadable source from an absent one.
      return { kind: "unavailable" };
    }
  }
}
