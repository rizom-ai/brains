import type { IMessagingNamespace } from "./context-types";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  CMS_WORKSPACE_UNREGISTER_MESSAGE,
  type CmsWorkspaceRegistration,
  type CmsWorkspaceRegistrationResult,
  type CmsWorkspaceUnregistration,
} from "../types/cms-workspace";

export interface ICmsNamespace {
  /** Whether a CMS host is currently mounted. */
  isAvailable(): boolean;

  /** Register a CMS workspace. Returns false when no CMS host is mounted. */
  registerWorkspace(
    workspace: Omit<CmsWorkspaceRegistration, "pluginId">,
  ): Promise<CmsWorkspaceRegistrationResult | false>;

  /** Withdraw one workspace or every workspace owned by this plugin. */
  unregisterWorkspace(workspaceId?: string): Promise<boolean>;
}

function hostError(
  operation: "register" | "unregister",
  error: string | undefined,
): Error {
  return new Error(
    `CMS workspace ${operation} failed: ${error ?? "unknown host error"}`,
  );
}

export function createCmsNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
  hasHandler: (channel: string) => boolean,
): ICmsNamespace {
  return {
    isAvailable: (): boolean => hasHandler(CMS_WORKSPACE_REGISTER_MESSAGE),
    async registerWorkspace(
      workspace,
    ): Promise<CmsWorkspaceRegistrationResult | false> {
      if (!hasHandler(CMS_WORKSPACE_REGISTER_MESSAGE)) return false;
      const response = await messaging.send<
        CmsWorkspaceRegistration,
        CmsWorkspaceRegistrationResult
      >({
        type: CMS_WORKSPACE_REGISTER_MESSAGE,
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
      if (!hasHandler(CMS_WORKSPACE_UNREGISTER_MESSAGE)) return false;
      const payload: CmsWorkspaceUnregistration = {
        pluginId,
        ...(workspaceId ? { workspaceId } : {}),
      };
      const response = await messaging.send<CmsWorkspaceUnregistration>({
        type: CMS_WORKSPACE_UNREGISTER_MESSAGE,
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
