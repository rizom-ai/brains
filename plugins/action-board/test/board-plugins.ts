import {
  createBuiltInStudioWorkspaceRegistration,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins/test";
import { actionBoardPackage, type BoardContext } from "../src";
import packageJson from "../package.json";

/**
 * The action board's plugins, as the canonical brain installs them: under
 * the action-board class's plugin id.
 */
export function createActionBoardPlugins(
  config: Record<string, unknown> = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    actionBoardPackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "action-board" },
  );
}

/**
 * The board's context over a test plugin context, as the runtime builds it
 * over the brain's: its entity service, its groupings and its Studio.
 */
export function boardContextFor(context: ServicePluginContext): BoardContext {
  return {
    entityService: context.entityService,
    groupings: {
      ensureGroupingsCurrent: () => context.entities.ensureGroupingsCurrent(),
      getGroupings: () => context.entities.getGroupings(),
      queryGroupingCatalog: (request) =>
        context.entityService.queryGroupingCatalog(request),
      queryGroupingMembers: (request) =>
        context.entityService.queryGroupingMembers(request),
    },
    studio: {
      isAvailable: () => !context.executionOnly && context.studio.isAvailable(),
      source: (input) =>
        createBuiltInStudioWorkspaceRegistration({ ...input, context }),
      register: async (registration): Promise<string | undefined> => {
        const result = await context.studio.registerWorkspace(registration);
        return result === false ? undefined : result.workspaceUrl;
      },
      unregister: (workspaceId) =>
        context.studio.unregisterWorkspace(workspaceId),
    },
  };
}
