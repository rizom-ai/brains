import {
  EMAIL_SOURCE_READ,
  emailSourceReadResponseSchema,
  type EmailSourceReadResponse,
} from "@brains/contracts";
import {
  inboxActorSchema,
  inboxItemIdSchema,
  type InboxActor,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { MailTriageOperatorService } from "./operator-service";

interface EmailWorkflowsSourceReadRequestValue {
  itemId: string;
  actor: InboxActor;
  signal?: AbortSignal | undefined;
}

const abortSignalSchema: z.ZodType<AbortSignal, AbortSignal> =
  z.custom<AbortSignal>(
    (value) =>
      typeof AbortSignal !== "undefined" && value instanceof AbortSignal,
  );

export const emailWorkflowsSourceReadRequestSchema: z.ZodType<
  EmailWorkflowsSourceReadRequestValue,
  EmailWorkflowsSourceReadRequestValue
> = z.strictObject({
  itemId: inboxItemIdSchema,
  actor: inboxActorSchema,
  signal: abortSignalSchema.optional(),
});

export type EmailWorkflowsSourceReadRequest = z.output<
  typeof emailWorkflowsSourceReadRequestSchema
>;

export class EmailWorkflowsSourceReader {
  private readonly context: Pick<ServicePluginContext, "messaging">;
  private readonly operator: MailTriageOperatorService;

  constructor(
    context: Pick<ServicePluginContext, "messaging">,
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
      const response = await this.context.messaging.send({
        type: EMAIL_SOURCE_READ,
        payload: {
          sourceRef,
          actor: request.data.actor,
          signal,
        },
      });
      if ("noop" in response || !response.success) {
        return { kind: "unavailable" };
      }
      const parsed = emailSourceReadResponseSchema.safeParse(response.data);
      return parsed.success ? parsed.data : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }
}
