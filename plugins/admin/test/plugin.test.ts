import { describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { fromYaml, z } from "@brains/utils";
import { adminPlugin, buildCmsConfigYaml, renderCmsShellHtml } from "../src";

function createAdminTestShell(options: { domain?: string } = {}): MockShell {
  const shell = createMockShell({
    ...(options.domain && { domain: options.domain }),
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

describe("admin plugin", () => {
  it("buildCmsConfigYaml should generate yaml from the plugin context", async () => {
    const shell = createAdminTestShell({ domain: "yeehaa.io" });
    const context = createServicePluginContext(shell, "admin");
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

  it("should expose a cms web route with inline config", async () => {
    const shell = createAdminTestShell({ domain: "yeehaa.io" });
    const plugin = adminPlugin({ routePath: "/cms" });

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(1);
    expect(routes.map((route) => route.path)).toEqual(["/cms"]);

    const cmsResponse = await routes[0]?.handler(
      new Request("http://brain/cms"),
    );
    expect(cmsResponse?.status).toBe(200);
    expect(cmsResponse?.headers.get("content-type")).toContain("text/html");
    const cmsHtml = await cmsResponse?.text();
    expect(cmsHtml).toContain("Content Manager");
    expect(cmsHtml).toContain("window.CMS_MANUAL_INIT = true");
    expect(cmsHtml).toContain("window.CMS_BOOTSTRAP_CONFIG");
    expect(cmsHtml).toContain("load_config_file");
    expect(cmsHtml).toContain("owner/repo");
    const expectedHtml = renderCmsShellHtml({
      cmsConfig: fromYaml(
        await buildCmsConfigYaml(createServicePluginContext(shell, "admin")),
      ),
    });
    expect(cmsHtml).toContain(
      '<script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>',
    );
    expect(cmsHtml).toContain(
      "window.initCMS?.({ config: window.CMS_BOOTSTRAP_CONFIG });",
    );
    expect(expectedHtml).toContain("window.CMS_BOOTSTRAP_CONFIG");
  });
});
