import { describe, expect, it } from "bun:test";
import {
  publishAssetRegisterContract,
  publishRegisterContract,
} from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { blogPlugin } from "./blog-plugin";

/**
 * What the blog registers, pinned as the blog plugin class registered it:
 * sites, queued jobs, the content pipeline and the site build name these
 * by string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("blog-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(blogPlugin());
  return { harness, evals, capabilities };
}

describe("the blog's registered surface", () => {
  it("registers the post type under the blog plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("blog");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/blog");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBe(
      'Saving an essay the user supplies as a post, or turning a note into a post ("turn my note X into a post": source.kind entity), is system_create: the text is kept, a leading # heading becomes the title, and the brain adds the excerpt and author. If the user says the essay was already published, pass fields { status: "published", publishedAt: "YYYY-MM-DD", canonicalUrl } with what they state.',
    );
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("post")).toMatchObject({
      weight: 2.0,
      defaultSort: [{ field: "publishedAt", direction: "desc" }],
      projectionSourceRole: "primary",
      publish: { publishStatuses: ["queued", "published"] },
      retiredFields: ["ogDescription", "twitterCard", "atprotoUri"],
    });
    const adapter = registry.getAdapter("post");
    expect(adapter.purpose).toBe(
      "A long-form published article, essay, or blog post written for an audience.",
    );
    expect(adapter.supportsCoverImage).toBe(true);
    expect(adapter.buildStub).toBeDefined();
    expect(adapter.getBodyTemplate()).toBe("");
  });

  it("registers its templates under the names sites and jobs use", async () => {
    const { harness } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("blog:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null])
        .sort(),
    ).toEqual([
      ["blog:excerpt", "shell:ai-content"],
      ["blog:generation", "shell:ai-content"],
      ["blog:homepage", "blog:homepage"],
      ["blog:og-image", null],
      ["blog:post-detail", "blog:entities"],
      ["blog:post-list", "blog:entities"],
      ["blog:printable", null],
    ]);
  });

  it("registers its data sources, job type and eval handlers", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getDataSources().keys()]
        .filter((id) => id.startsWith("blog:"))
        .sort(),
    ).toEqual(["blog:entities", "blog:rss"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["post:generation"]);
    expect(evals.sort()).toEqual(["blog:generateExcerpt", "blog:generatePost"]);
  });

  it("registers its attachments and its AT Protocol projection", async () => {
    const { harness } = await installed();
    const shell = harness.getMockShell();
    for (const attachmentType of ["printable", "og-image"]) {
      expect(
        shell.getAttachmentRegistry().hasProvider("post", attachmentType),
      ).toBe(true);
    }
    expect(shell.getAtprotoProjectionRegistry().get("post")).toMatchObject({
      collection: "ai.rizom.brain.post",
      validate: false,
    });
  });

  it("registers the post and its social card with the publish pipeline once plugins are in", async () => {
    const { harness } = await installed();
    const registered: unknown[] = [];
    const assets: unknown[] = [];
    harness.subscribe(publishRegisterContract.name, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    harness.subscribe(publishAssetRegisterContract.name, async (message) => {
      assets.push(message.payload);
      return { success: true };
    });
    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );
    expect(registered).toEqual([
      {
        entityType: "post",
        provider: expect.objectContaining({ name: "internal" }),
        config: { executionMode: "provider" },
      },
    ]);
    expect(assets).toEqual([
      {
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
      },
    ]);
  });
});
