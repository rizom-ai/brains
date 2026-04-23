import { describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { fromYaml, z } from "@brains/utils";
import { cmsPlugin, buildCmsConfigYaml, renderCmsShellHtml } from "../src";

function createCmsTestShell(
  options: {
    domain?: string;
    entityDisplay?: Record<string, { label: string; pluralName?: string }>;
  } = {},
): MockShell {
  const shell = createMockShell({
    ...(options.domain && { domain: options.domain }),
    ...(options.entityDisplay && { entityDisplay: options.entityDisplay }),
  });
  shell.getMessageBus().subscribe("git-sync:get-repo-info", async () => ({
    success: true,
    data: { repo: "owner/repo", branch: "main" },
  }));

  shell.getEntityService = (): ReturnType<MockShell["getEntityService"]> =>
    ({
      getEntityTypes: (): string[] => ["note", "post"],
    }) as ReturnType<MockShell["getEntityService"]>;

  shell.getEntityRegistry = (): ReturnType<MockShell["getEntityRegistry"]> =>
    ({
      getEffectiveFrontmatterSchema: (
        type: string,
      ):
        | z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            summary: z.ZodOptional<z.ZodString>;
          }>
        | undefined => {
        if (type === "note" || type === "post") {
          return z.object({
            title: z.string().optional(),
            summary: z.string().optional(),
          });
        }
        return undefined;
      },
      getAdapter: (
        type: string,
      ): { isSingleton: false; hasBody: true } | undefined => {
        if (type === "note" || type === "post") {
          return { isSingleton: false, hasBody: true };
        }
        return undefined;
      },
    }) as ReturnType<MockShell["getEntityRegistry"]>;

  return shell;
}

describe("cms plugin", () => {
  it("buildCmsConfigYaml should generate yaml from the plugin context", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const context = createServicePluginContext(shell, "cms");
    const yaml = await buildCmsConfigYaml(context, {
      entityDisplay: {
        post: { label: "Essay" },
      },
    });
    const parsed = fromYaml<{
      backend: { repo: string; branch: string; base_url?: string };
      collections: Array<{ name: string; label: string }>;
    }>(yaml);

    expect(parsed.backend.repo).toBe("owner/repo");
    expect(parsed.backend.branch).toBe("main");
    expect(parsed.backend.base_url).toBe("https://yeehaa.io");
    expect(
      parsed.collections.some(
        (collection) =>
          collection.name === "post" && collection.label === "Essays",
      ),
    ).toBe(true);
  });

  it("uses entityDisplay from plugin context when config does not provide it", async () => {
    const shell = createCmsTestShell({
      domain: "yeehaa.io",
      entityDisplay: {
        post: { label: "Essay" },
      },
    });
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const configRoute = plugin.getWebRoutes()[1];
    const response = await configRoute?.handler(
      new Request("http://brain/cms/config.yml"),
    );
    expect(response?.status).toBe(200);

    const yaml = await response?.text();
    expect(yaml).toContain("name: post");
    expect(yaml).toContain("label: Essays");
  });

  it("should default to /cms for the shell route and config route", async () => {
    const shell = createCmsTestShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(2);
    expect(routes.map((route) => route.path)).toEqual([
      "/cms",
      "/cms/config.yml",
    ]);

    const cmsRoute = routes[0];
    const configRoute = routes[1];

    const cmsResponse = await cmsRoute?.handler(
      new Request("http://brain/cms"),
    );
    expect(cmsResponse?.status).toBe(200);
    expect(cmsResponse?.headers.get("content-type")).toContain("text/html");
    const cmsHtml = await cmsResponse?.text();
    expect(cmsHtml).toContain("Content Manager");
    expect(cmsHtml).toContain('rel="cms-config-url"');
    expect(cmsHtml).toContain('href="/cms/config.yml"');
    expect(cmsHtml).toContain(
      '<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>',
    );

    const configResponse = await configRoute?.handler(
      new Request("http://brain/cms/config.yml"),
    );
    expect(configResponse?.status).toBe(200);
    expect(configResponse?.headers.get("content-type")).toContain(
      "application/yaml",
    );
    const configYaml = await configResponse?.text();
    expect(configYaml).toContain("owner/repo");
    expect(configYaml).toContain("branch: main");

    const expectedHtml = renderCmsShellHtml({
      cmsConfigPath: "/cms/config.yml",
    });
    expect(cmsHtml).toBe(expectedHtml);
  });

  it("advertises the CMS endpoint so the dashboard can link to it", async () => {
    const shell = createCmsTestShell();
    const plugin = cmsPlugin();

    await plugin.register(shell);

    const endpoints = shell.listEndpoints();
    const cms = endpoints.find((e) => e.label === "CMS");
    expect(cms).toBeDefined();
    expect(cms?.url).toBe("/cms");
    expect(cms?.pluginId).toBe("cms");
  });
});
