import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  instantiatePluginPackageDefinition,
  type BaseEntity,
  type DashboardWidgetRegistration,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { conversationMemoryPackage, type SummaryConfigInput } from "../src";
import packageJson from "../package.json";

/**
 * The conversation-memory package's plugins, as the canonical brain
 * installs them: under the conversation-memory class's plugin id, each of
 * its types as itself.
 */
export function createConversationMemoryPlugins(
  config: SummaryConfigInput = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    conversationMemoryPackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "conversation-memory" },
  );
}

/**
 * Install the conversation-memory package on a test harness, as a brain
 * installs it: its types first, then the service. The service's
 * capabilities.
 */
export async function installConversationMemory(
  harness: { installPlugin(plugin: Plugin): Promise<PluginCapabilities> },
  config: SummaryConfigInput = {},
): Promise<PluginCapabilities> {
  const installed: PluginCapabilities[] = [];
  for (const plugin of createConversationMemoryPlugins(config))
    installed.push(await harness.installPlugin(plugin));
  const service = installed.at(-1);
  if (!service)
    throw new Error("The conversation-memory package installed nothing");
  return service;
}

/**
 * The conversation-memory package on a shell, its Dashboard widgets as the
 * Dashboard receives them once every plugin has registered.
 */
export async function installedWidgets(
  shell: MockShell,
): Promise<DashboardWidgetRegistration[]> {
  const registered: DashboardWidgetRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<DashboardWidgetRegistration>(
      dashboardWidgetRegisterContract.name,
      async (message) => {
        registered.push(message.payload);
        return { success: true };
      },
    );
  for (const plugin of createConversationMemoryPlugins())
    await plugin.register(shell);
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
  return registered;
}

/** A record as the brain stores it: its metadata as the header of its document. */
export function asStored<T extends BaseEntity>(entity: T): T {
  return {
    ...entity,
    content: generateMarkdown(
      Object.fromEntries(Object.entries(entity.metadata)),
      entity.content,
    ),
  };
}

/** A type's adapter, as the installed package registers it. */
export async function typeAdapter(
  entityType: string,
): Promise<
  ReturnType<ReturnType<MockShell["getEntityRegistry"]>["getAdapter"]>
> {
  const shell = createMockShell();
  for (const plugin of createConversationMemoryPlugins())
    await plugin.register(shell);
  return shell.getEntityRegistry().getAdapter(entityType);
}
