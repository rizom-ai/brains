import {
  emailSourceReadContract,
  type EmailSourceReadResponse,
} from "@brains/contracts";
import {
  inboxActorSchema,
  inboxItemIdSchema,
  type ServiceClassMessaging,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
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

export class EmailWorkflowsSourceReader {
  private readonly context: {
    readonly messaging: Pick<ServiceClassMessaging, "request">;
  };
  private readonly operator: MailTriageOperatorService;

  constructor(
    context: { readonly messaging: Pick<ServiceClassMessaging, "request"> },
    operator: MailTriageOperatorService,
  ) {
    this.context = context;
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
      const read = await this.context.messaging.request(
        emailSourceReadContract,
        { sourceRef, actor: request.data.actor, signal },
      );
      return read.status === "answered" ? read.data : { kind: "unavailable" };
    } catch {
      // Same fixed outcome as every other failure above: the caller must
      // not be able to tell an unreadable source from an absent one.
      return { kind: "unavailable" };
    }
  }
}
