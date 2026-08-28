import type { IMessagingNamespace } from "./context-types";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceRegistrationResult,
  type StudioWorkspaceUnregistration,
} from "../types/studio-workspace";

export interface IStudioNamespace {
  /** Whether a Studio host is currently mounted. */
  isAvailable(): boolean;

  /** Register a Studio workspace. Returns false when no Studio host is mounted. */
  registerWorkspace(
    workspace: Omit<StudioWorkspaceRegistration, "pluginId">,
  ): Promise<StudioWorkspaceRegistrationResult | false>;

  /** Withdraw one workspace or every workspace owned by this plugin. */
  unregisterWorkspace(workspaceId?: string): Promise<boolean>;
}

function hostError(
  operation: "register" | "unregister",
  error: string | undefined,
): Error {
  return new Error(
    `Studio workspace ${operation} failed: ${error ?? "unknown host error"}`,
  );
}

export function createStudioNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
  hasHandler: (channel: string) => boolean,
): IStudioNamespace {
  return {
    isAvailable: (): boolean => hasHandler(STUDIO_WORKSPACE_REGISTER_MESSAGE),
    async registerWorkspace(
      workspace,
    ): Promise<StudioWorkspaceRegistrationResult | false> {
      if (!hasHandler(STUDIO_WORKSPACE_REGISTER_MESSAGE)) return false;
      const response = await messaging.send<
        StudioWorkspaceRegistration,
        StudioWorkspaceRegistrationResult
      >({
        type: STUDIO_WORKSPACE_REGISTER_MESSAGE,
        payload: { ...workspace, pluginId },
      });
      if ("noop" in response) {
        throw hostError("register", undefined);
      }
      if (!response.success || response.data === undefined) {
        throw hostError("register", response.error);
      }
      return response.data;
    },

    async unregisterWorkspace(workspaceId): Promise<boolean> {
      if (!hasHandler(STUDIO_WORKSPACE_UNREGISTER_MESSAGE)) return false;
      const payload: StudioWorkspaceUnregistration = {
        pluginId,
        ...(workspaceId ? { workspaceId } : {}),
      };
      const response = await messaging.send<StudioWorkspaceUnregistration>({
        type: STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
        payload,
      });
      if ("noop" in response) {
        throw hostError("unregister", undefined);
      }
      if (!response.success) {
        throw hostError("unregister", response.error);
      }
      return true;
    },
  };
}
