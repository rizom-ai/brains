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
      try {
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
        if (error instanceof DraftRevisionConflictError) {
          return emailReplyDraftActionOutcomeSchema.parse({
            kind: "error",
            error: "Draft changed; reload before saving",
          });
        }
        return emailReplyDraftActionOutcomeSchema.parse({
          kind: "error",
          error:
            action.data.type === "generate"
              ? "Draft generation failed"
              : "Draft save failed",
        });
      }
    },
  };

  return registerCmsWorkspace(context, registration);
}

function queryMailItemId(input: unknown): string | undefined {
  const query = z
    .looseObject({ mailItemId: z.string().min(1) })
    .safeParse(input);
  return query.success ? query.data.mailItemId : undefined;
}
