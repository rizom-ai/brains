import type { RuntimeOperatorActionControl } from "@brains/plugins";
import { useCallback } from "react";
import { type PublishingAction, type PublishingActionResult } from "./api";
import {
  isPublishConfirmation,
  isPublishingActionError,
} from "./publication-actions";
import { invalidateAfterWorkspaceAction } from "./queries";

import type { QueryClient, UseMutationResult } from "@tanstack/react-query";
import type { StudioWorkspaceInfo } from "./api";
import type { DeclarativeWorkspaceActionInput } from "./mutations";
import type { EditorMode } from "./editor-workflow";
import type { SaveState } from "./editor-workflow";

export interface WorkspaceActionsInput {
  queryClient: QueryClient;
  workspaces: StudioWorkspaceInfo[];
  activeWorkspaceId: string | null;
  entityType: string | null;
  mode: EditorMode;
  declarativeWorkspaceActionMutation: UseMutationResult<
    unknown,
    Error,
    DeclarativeWorkspaceActionInput
  >;
  /** Re-open the acted-on entity so the editor shows the action's result. */
  openEntity: (id: string, nextState?: SaveState) => void;
}

export interface WorkspaceActions {
  performPublishingAction: (
    action: PublishingAction,
  ) => Promise<PublishingActionResult>;
  performDeclarativeAction: (
    action: RuntimeOperatorActionControl,
  ) => Promise<unknown>;
}

/**
 * Actions a workspace exposes: the publishing capability's two-step confirm
 * flow, and the generic declarative action a rendered workspace dispatches.
 * Both invalidate the workspace's data once the action has taken effect.
 */
export function useWorkspaceActions(
  input: WorkspaceActionsInput,
): WorkspaceActions {
  const {
    queryClient,
    workspaces,
    activeWorkspaceId,
    entityType,
    mode,
    declarativeWorkspaceActionMutation,
    openEntity,
  } = input;

  const performPublishingAction = useCallback(
    async (action: PublishingAction): Promise<PublishingActionResult> => {
      const capability = workspaces.find(
        (workspace) =>
          workspace.pluginId === "content-pipeline" &&
          workspace.entityTypes.includes(action.entityType),
      );
      if (!capability) throw new Error("Publishing is unavailable");

      const input = {
        entityType: action.entityType,
        entityId: action.entityId,
        ...(action.type === "reorder" ? { position: action.position } : {}),
      };
      if (action.type === "publish" && !action.confirmation) {
        const prepared = await declarativeWorkspaceActionMutation.mutateAsync({
          workspaceId: capability.id,
          action: {
            actionId: "publish",
            label: "Publish now",
            input,
            invocation: { mode: "prepare" },
          },
        });
        if (
          typeof prepared !== "object" ||
          prepared === null ||
          !("kind" in prepared) ||
          prepared.kind !== "prepared-confirmation" ||
          !("token" in prepared) ||
          typeof prepared.token !== "string" ||
          !("summary" in prepared) ||
          typeof prepared.summary !== "string" ||
          !("expiresAt" in prepared) ||
          typeof prepared.expiresAt !== "string"
        ) {
          throw new Error("Publishing confirmation is unavailable");
        }
        return {
          needsConfirmation: true,
          summary: prepared.summary,
          args: {
            confirmed: true,
            confirmationToken: prepared.token,
            contentHash: prepared.token,
            expiresAt: prepared.expiresAt,
          },
        };
      }
      const rawResult = await declarativeWorkspaceActionMutation.mutateAsync({
        workspaceId: capability.id,
        action: {
          actionId: action.type,
          label: action.type,
          input,
          ...(action.type === "publish" && action.confirmation
            ? {
                invocation: {
                  mode: "execute",
                  token: action.confirmation.confirmationToken,
                },
              }
            : {}),
        },
      });
      if (typeof rawResult !== "object" || rawResult === null) {
        throw new Error("Publishing returned an invalid result");
      }
      const result: PublishingActionResult =
        "success" in rawResult && rawResult.success === false
          ? {
              success: false,
              error:
                "error" in rawResult && typeof rawResult.error === "string"
                  ? rawResult.error
                  : "Publishing failed",
              ...("code" in rawResult && typeof rawResult.code === "string"
                ? { code: rawResult.code }
                : {}),
            }
          : { success: true };
      if (!isPublishingActionError(result) && !isPublishConfirmation(result)) {
        await invalidateAfterWorkspaceAction(queryClient, capability.id);
        if (
          mode.kind === "edit" &&
          entityType === action.entityType &&
          mode.entity.id === action.entityId
        ) {
          openEntity(action.entityId);
        }
      }
      return result;
    },
    [
      entityType,
      mode,
      openEntity,
      queryClient,
      declarativeWorkspaceActionMutation,
      workspaces,
    ],
  );

  const performDeclarativeAction = useCallback(
    async (action: RuntimeOperatorActionControl): Promise<unknown> => {
      if (!activeWorkspaceId) {
        throw new Error("Declarative workspace is unavailable");
      }
      try {
        const result = await declarativeWorkspaceActionMutation.mutateAsync({
          workspaceId: activeWorkspaceId,
          action,
        });
        await invalidateAfterWorkspaceAction(queryClient, activeWorkspaceId);
        return result;
      } finally {
        declarativeWorkspaceActionMutation.reset();
      }
    },
    [activeWorkspaceId, declarativeWorkspaceActionMutation, queryClient],
  );

  return { performPublishingAction, performDeclarativeAction };
}
