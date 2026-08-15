import {
  assertCmsWorkspaceAdmin,
  registerCmsWorkspace,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { setSameOriginSearchParams } from "@brains/plugins/internal/same-origin-path";
import { z } from "@brains/utils/zod";
import {
  DraftRevisionConflictError,
  DraftSendRevisionConflictError,
  EmailDeliveryFailedError,
  EmailDeliveryUnavailableError,
  EmailReplySourceUnavailableError,
  type EmailReplyDraftOperator,
} from "./operator";
import {
  emailReplyDraftActionOutcomeSchema,
  emailReplyDraftActionSchema,
  emailReplyDraftSourceOutcomeSchema,
  emailReplyDraftSourceRequestSchema,
  emailReplyDraftWorkspaceSnapshotSchema,
} from "./schemas";

const draftContextSchema = z.strictObject({
  mailItemId: z.string().regex(/^mail-[a-f0-9]{64}$/),
});

export function registerEmailReplyDraftFollowUp(
  context: ServicePluginContext,
  getWorkspaceUrl: () => string | undefined,
): void {
  context.inboxFollowUps.registerKind({
    kind: "draft-reply",
    label: "Draft reply",
    priority: 100,
    mode: "declared",
    permissionLevel: "admin",
    contextSchema: draftContextSchema,
    applies: ({ sourceId, item }) =>
      sourceId === "mail-items" && item.entityRef?.entityType === "mail-item",
    resolve: ({ context: followUpContext }) => {
      const workspaceUrl = getWorkspaceUrl();
      if (!workspaceUrl || !followUpContext) return undefined;
      const href = setSameOriginSearchParams(workspaceUrl, [
        ["mailItemId", followUpContext["mailItemId"] ?? ""],
      ]);
      return href ? { href } : undefined;
    },
  });
}

export async function registerEmailReplyDraftWorkspace(
  context: ServicePluginContext,
  operator: EmailReplyDraftOperator,
): Promise<string | undefined> {
  const registration: CmsWorkspaceRegistration = {
    id: "email-reply-drafts",
    pluginId: context.pluginId,
    label: "Reply drafts",
    rendererName: "EmailReplyDraftWorkspace",
    priority: 21,
    urlQuery: true,
    accessHandler: (actor) => actor.userPermissionLevel === "admin",
    dataProvider: async (actor, query) => {
      assertCmsWorkspaceAdmin(actor, "Email reply drafting");
      const mailItemId = queryMailItemId(query);
      if (!mailItemId) {
        return emailReplyDraftWorkspaceSnapshotSchema.parse({
          mailItemId: null,
          draft: null,
        });
      }
      return emailReplyDraftWorkspaceSnapshotSchema.parse(
        await operator.snapshot(mailItemId, {
          permissionLevel: actor.userPermissionLevel,
        }),
      );
    },
    actionHandler: async (input, actor, signal) => {
      assertCmsWorkspaceAdmin(actor, "Email reply drafting");
      const sourceRequest = emailReplyDraftSourceRequestSchema.safeParse(input);
      if (sourceRequest.success) {
        try {
          const source = await operator.readSource(
            sourceRequest.data.mailItemId,
            { permissionLevel: actor.userPermissionLevel },
            signal,
          );
          return emailReplyDraftSourceOutcomeSchema.parse(
            source
              ? { kind: "source", source }
              : {
                  kind: "source-unavailable",
                  error: "Original content is unavailable",
                },
          );
        } catch {
          return emailReplyDraftSourceOutcomeSchema.parse({
            kind: "source-unavailable",
            error: "Original content is unavailable",
          });
        }
      }
      const action = emailReplyDraftActionSchema.safeParse(input);
      if (!action.success) {
        return emailReplyDraftActionOutcomeSchema.parse({
          kind: "error",
          error: "Invalid draft action",
        });
      }
      if (action.data.type === "send" && !action.data.confirmed) {
        return emailReplyDraftActionOutcomeSchema.parse({
          kind: "confirmation",
          summary: `Send reply revision ${action.data.revision}?`,
        });
      }
      try {
        if (action.data.type === "send") {
          return emailReplyDraftActionOutcomeSchema.parse({
            kind: "sent",
            draft: await operator.sendConfirmed(
              action.data.mailItemId,
              action.data.revision,
              { permissionLevel: actor.userPermissionLevel },
              signal,
            ),
          });
        }
        const draft =
          action.data.type === "generate"
            ? await operator.generate(
                action.data.mailItemId,
                { permissionLevel: actor.userPermissionLevel },
                signal,
              )
            : await operator.save(
                action.data.mailItemId,
                action.data.text,
                action.data.baseRevision,
                { permissionLevel: actor.userPermissionLevel },
              );
        return emailReplyDraftActionOutcomeSchema.parse({
          kind: "draft",
          draft,
        });
      } catch (error) {
        const fixedError = draftActionError(action.data.type, error);
        return emailReplyDraftActionOutcomeSchema.parse({
          kind: "error",
          error: fixedError,
        });
      }
    },
  };

  return registerCmsWorkspace(context, registration);
}

function draftActionError(
  type: "generate" | "save" | "send",
  error: unknown,
):
  | "Draft generation failed"
  | "Draft save failed"
  | "Draft changed; reload before saving"
  | "Draft changed; review before sending"
  | "Email delivery is unavailable"
  | "Original content is unavailable"
  | "Email delivery failed" {
  if (error instanceof DraftRevisionConflictError) {
    return "Draft changed; reload before saving";
  }
  if (error instanceof DraftSendRevisionConflictError) {
    return "Draft changed; review before sending";
  }
  if (error instanceof EmailDeliveryUnavailableError) {
    return "Email delivery is unavailable";
  }
  if (error instanceof EmailReplySourceUnavailableError) {
    return "Original content is unavailable";
  }
  if (error instanceof EmailDeliveryFailedError) {
    return "Email delivery failed";
  }
  return type === "generate"
    ? "Draft generation failed"
    : type === "save"
      ? "Draft save failed"
      : "Email delivery failed";
}

function queryMailItemId(input: unknown): string | undefined {
  const query = z
    .looseObject({ mailItemId: z.string().min(1) })
    .safeParse(input);
  return query.success ? query.data.mailItemId : undefined;
}
