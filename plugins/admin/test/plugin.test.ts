import { describe, expect, it } from "bun:test";
import type { Resource } from "@brains/plugins";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { fromYaml, z } from "@brains/utils";
import {
  adminPlugin,
  buildCmsConfigYaml,
  CMS_CONFIG_URI,
  CMS_SHELL_PATH,
  renderAdminShellHtml,
  renderCmsShellHtml,
} from "../src";

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

  it("should register the cms config resource", async () => {
    const shell = createAdminTestShell();
    const plugin = adminPlugin();

    const capabilities = await plugin.register(shell);
    const resource = capabilities.resources.find(
      (entry: Resource) => entry.uri === CMS_CONFIG_URI,
    );

    expect(resource).toBeDefined();
    const result = await resource?.handler();
    expect(result?.contents[0]?.uri).toBe(CMS_CONFIG_URI);
    expect(result?.contents[0]?.mimeType).toBe("text/yaml");
    expect(result?.contents[0]?.text).toContain("owner/repo");
  });

  it("should answer system:cms-config:get via messaging", async () => {
    const shell = createAdminTestShell();
    const plugin = adminPlugin();

    await plugin.register(shell);

    const response = await shell
      .getMessageBus()
      .send<Record<string, never>, string>("system:cms-config:get", {}, "test");

    expect("noop" in response).toBe(false);
    if ("noop" in response || !response.success || !response.data) {
      throw new Error("Expected cms config response");
    }

    const parsed = fromYaml<{ backend: { repo: string; branch: string } }>(
      response.data,
    );
    expect(parsed.backend.repo).toBe("owner/repo");
    expect(parsed.backend.branch).toBe("main");
  });

  it("should expose web routes for cms config, admin home, and cms shell", async () => {
    const shell = createAdminTestShell({ domain: "yeehaa.io" });
    const plugin = adminPlugin({ routePath: "/cms" });

    await plugin.register(shell);

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(3);
    expect(routes.map((route) => route.path)).toEqual([
      "/cms-config",
      "/cms",
      CMS_SHELL_PATH,
    ]);

    const cmsResponse = await routes[0]?.handler(
      new Request("http://brain/cms-config"),
    );
    expect(cmsResponse?.status).toBe(200);
    expect(cmsResponse?.headers.get("content-type")).toContain("text/yaml");
    expect(await cmsResponse?.text()).toContain("owner/repo");

    const adminResponse = await routes[1]?.handler(
      new Request("http://brain/cms"),
    );
    expect(adminResponse?.status).toBe(200);
    expect(adminResponse?.headers.get("content-type")).toContain("text/html");
    const adminHtml = await adminResponse?.text();
    expect(adminHtml).toContain("Brain Admin");
    expect(adminHtml).toContain(CMS_SHELL_PATH);
    expect(adminHtml).toContain("https://yeehaa.io");
    expect(adminHtml).toContain("https://preview.yeehaa.io");
    expect(adminHtml).toContain(
      renderAdminShellHtml({
        cmsShellPath: CMS_SHELL_PATH,
        siteUrl: "https://yeehaa.io",
        previewUrl: "https://preview.yeehaa.io",
      }).trim(),
    );

    const shellResponse = await routes[2]?.handler(
      new Request(`http://brain${CMS_SHELL_PATH}`),
    );
    expect(shellResponse?.status).toBe(200);
    expect(shellResponse?.headers.get("content-type")).toContain("text/html");
    expect(await shellResponse?.text()).toContain(renderCmsShellHtml().trim());
  });
});
