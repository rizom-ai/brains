import { sdkErrorFrom } from "@brains/contracts";
import type { IMessagingNamespace } from "./context-types";
import {
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceRegistrationResult,
} from "../contracts/studio-workspace-contracts";

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

export function createStudioNamespace(
  messaging: IMessagingNamespace,
  pluginId: string,
  hasHandler: (channel: string) => boolean,
): IStudioNamespace {
  return {
    isAvailable: (): boolean =>
      hasHandler(studioWorkspaceRegisterContract.name),
    async registerWorkspace(
      workspace,
    ): Promise<StudioWorkspaceRegistrationResult | false> {
      if (!hasHandler(studioWorkspaceRegisterContract.name)) return false;
      const result = await messaging.request(studioWorkspaceRegisterContract, {
        ...workspace,
        pluginId,
      });
      if (result.status === "failed") {
        throw sdkErrorFrom(
          result.error,
          `Studio workspace register failed: ${result.error.message}`,
        );
      }
      return result.status === "answered" ? result.data : false;
    },

    async unregisterWorkspace(workspaceId): Promise<boolean> {
      if (!hasHandler(studioWorkspaceUnregisterContract.name)) return false;
      const result = await messaging.request(
        studioWorkspaceUnregisterContract,
        { pluginId, ...(workspaceId ? { workspaceId } : {}) },
      );
      if (result.status === "failed") {
        throw sdkErrorFrom(
          result.error,
          `Studio workspace unregister failed: ${result.error.message}`,
        );
      }
      return result.status === "answered";
    },
  };
}
