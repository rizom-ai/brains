import type { ServicePluginContext } from "@brains/plugins";
import type { RegisteredWidget } from "./widget-registry";

const SYSTEM_PLUGIN_ID = "system";

export function createSystemWidgets(
  context: ServicePluginContext,
): RegisteredWidget[] {
  return [
    {
      id: "entity-stats",
      pluginId: SYSTEM_PLUGIN_ID,
      title: "Entity Statistics",
      section: "primary",
      priority: 10,
      rendererName: "StatsWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const counts = await context.entityService.getEntityCounts();
        return {
          stats: Object.fromEntries(
            counts.map(({ entityType, count }) => [entityType, count]),
          ),
        };
      },
    },
    {
      id: "character",
      pluginId: SYSTEM_PLUGIN_ID,
      title: "Brain Character",
      section: "sidebar",
      priority: 5,
      rendererName: "IdentityWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const character = context.identity.get();
        return {
          name: character.name,
          role: character.role,
          purpose: character.purpose,
          values: character.values,
        };
      },
    },
    {
      id: "profile",
      pluginId: SYSTEM_PLUGIN_ID,
      title: "Anchor Profile",
      section: "sidebar",
      priority: 10,
      rendererName: "ProfileWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const profile = context.identity.getProfile();
        const links: Array<{ label: string; url: string }> = [];
        if (profile.website) {
          links.push({ label: "Website", url: profile.website });
        }
        if (profile.socialLinks) {
          for (const social of profile.socialLinks) {
            links.push({ label: social.platform, url: social.url });
          }
        }
        return {
          name: profile.name,
          description: profile.description,
          links: links.length > 0 ? links : undefined,
        };
      },
    },
    {
      id: "system-info",
      pluginId: SYSTEM_PLUGIN_ID,
      title: "System",
      section: "sidebar",
      priority: 15,
      rendererName: "SystemWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const appInfo = await context.identity.getAppInfo();
        const links: Array<{ label: string; url: string }> = [];

        const profile = context.identity.getProfile();
        if (profile.website) {
          links.push({ label: "Site", url: profile.website });
        }

        const webserver = appInfo.daemons.find(
          (d) => d.pluginId === "webserver",
        );
        const previewUrl = webserver?.health?.details?.["previewUrl"];
        if (typeof previewUrl === "string") {
          links.push({ label: "Preview", url: previewUrl });
        }

        const mcp = appInfo.daemons.find((d) => d.pluginId === "mcp");
        const mcpUrl = mcp?.health?.details?.["url"];
        if (typeof mcpUrl === "string") {
          links.push({ label: "MCP", url: mcpUrl });
        }

        return {
          version: appInfo.version,
          entities: appInfo.entities,
          rendered: new Date().toLocaleString(),
          links: links.length > 0 ? links : undefined,
        };
      },
    },
  ];
}
