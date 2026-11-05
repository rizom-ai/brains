import type { RegisteredWebRoute } from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";

/** Install Web Chat as the brain's chat backend: its package and its API route. */
export function enableChatCapability(shell: MockShell): void {
  const getPluginPackageName = shell.getPluginPackageName.bind(shell);
  shell.getPluginPackageName = (pluginId): string | undefined =>
    pluginId === "web-chat"
      ? "@brains/web-chat"
      : getPluginPackageName(pluginId);
  const getPluginWebRoutes = shell.getPluginWebRoutes.bind(shell);
  shell.getPluginWebRoutes = (): RegisteredWebRoute[] => [
    ...getPluginWebRoutes(),
    {
      pluginId: "web-chat",
      fullPath: "/api/chat",
      definition: {
        path: "/api/chat",
        method: "POST",
        role: "chat-api",
        handler: (): Response => new Response(),
      },
    },
  ];
}
