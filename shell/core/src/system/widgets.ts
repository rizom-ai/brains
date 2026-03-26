import type { SystemServices } from "./types";

export interface DashboardWidget {
  id: string;
  pluginId: string;
  title: string;
  section: string;
  priority: number;
  rendererName: string;
  dataProvider: () => Promise<Record<string, unknown>>;
}

export function createSystemWidgets(
  services: SystemServices,
): DashboardWidget[] {
  return [
    {
      id: "entity-stats",
      pluginId: "system",
      title: "Entity Statistics",
      section: "primary",
      priority: 10,
      rendererName: "StatsWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const counts = await services.entityService.getEntityCounts();
        return {
          stats: Object.fromEntries(
            counts.map(({ entityType, count }) => [entityType, count]),
          ),
        };
      },
    },
    {
      id: "character",
      pluginId: "system",
      title: "Brain Character",
      section: "sidebar",
      priority: 5,
      rendererName: "IdentityWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const character = services.getIdentity();
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
      pluginId: "system",
      title: "Anchor Profile",
      section: "sidebar",
      priority: 10,
      rendererName: "ProfileWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const profile = services.getProfile();
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
      pluginId: "system",
      title: "System",
      section: "sidebar",
      priority: 15,
      rendererName: "SystemWidget",
      dataProvider: async (): Promise<Record<string, unknown>> => {
        const appInfo = await services.getAppInfo();
        const links: Array<{ label: string; url: string }> = [];

        const profile = services.getProfile();
        if (profile.website) {
          links.push({ label: "Site", url: profile.website });
        }

        const webserver = appInfo.interfaces.find((i) =>
          i.name.startsWith("webserver"),
        );
        const previewUrl = webserver?.health?.details?.["previewUrl"];
        if (typeof previewUrl === "string") {
          links.push({ label: "Preview", url: previewUrl });
        }

        const mcp = appInfo.interfaces.find((i) => i.name.startsWith("mcp"));
        const mcpUrl = mcp?.health?.details?.["url"];
        if (typeof mcpUrl === "string") {
          links.push({ label: "MCP", url: mcpUrl });
        }

        return {
          version: appInfo.version,
          plugins: `${appInfo.plugins.length} active`,
          rendered: new Date().toLocaleString(),
          links: links.length > 0 ? links : undefined,
        };
      },
    },
  ];
}
