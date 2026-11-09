import { describe, expect, it } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type { SocialMediaConfigInput } from "../src";
import { socialMediaPlugin } from "./social-media-plugin";

const publishRegistrationSchema = z.looseObject({
  entityType: z.string(),
  provider: z.looseObject({ name: z.string() }),
  config: z.looseObject({ publishResultIdField: z.string().optional() }),
});

/**
 * What the social media package registers, pinned as the social media
 * plugin class registered it: sites, queued jobs, the publish pipeline and
 * the AT Protocol service name these by string.
 */
async function installed(config: SocialMediaConfigInput = {}): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("social-media-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(socialMediaPlugin(config));
  return { harness, evals, capabilities };
}

async function registeredProviders(
  config: SocialMediaConfigInput,
): Promise<z.output<typeof publishRegistrationSchema>[]> {
  const { harness } = await installed(config);
  const received: z.output<typeof publishRegistrationSchema>[] = [];
  harness.subscribe(publishRegisterContract.name, async (message) => {
    received.push(publishRegistrationSchema.parse(message.payload));
    return { success: true };
  });
  await harness.sendMessage(
    SYSTEM_CHANNELS.pluginsRegistered,
    { timestamp: new Date().toISOString(), pluginCount: 1 },
    "shell",
    true,
  );
  return received;
}

describe("the social media package's registered surface", () => {
  it("registers the social post type under the social-media plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("social-media");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/social-media");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("social-post")).toMatchObject({
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    });
    const adapter = registry.getAdapter("social-post");
    expect(adapter.purpose).toBe(
      "A short post drafted for social media such as LinkedIn or X.",
    );
    expect(adapter.supportsCoverImage).toBe(true);
    expect(adapter.buildStub).toBeDefined();
    expect(adapter.getBodyTemplate()).toBe("");
    expect(registry.getCreateInterceptor("social-post")).toBeUndefined();
  });

  it("registers its templates, data source, job type and evals", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("social-media:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null])
        .sort(),
    ).toEqual([
      ["social-media:linkedin", "shell:ai-content"],
      ["social-media:social-post-detail", "social-media:posts"],
      ["social-media:social-post-list", "social-media:posts"],
    ]);
    expect(
      [...harness.getDataSources().keys()].filter((id) =>
        id.startsWith("social-media:"),
      ),
    ).toEqual(["social-media:posts"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes().sort(),
    ).toEqual(["social-post:generation"]);
    expect(evals.sort()).toEqual([
      "social-media:create",
      "social-media:generation",
    ]);
  });

  it("derives social posts from blog posts only when asked to", async () => {
    const { capabilities } = await installed({
      autoGenerateOnBlogPublish: true,
    });
    expect(
      capabilities.projectionRules?.map(({ id, targetType, sources }) => ({
        id,
        targetType,
        sources,
      })),
    ).toEqual([
      {
        id: "social-post-generation",
        targetType: "social-post",
        sources: [{ kind: "entity", types: ["post"] }],
      },
    ]);
  });

  it("publishes through LinkedIn only when it has an access token", async () => {
    expect(await registeredProviders({})).toEqual([]);
    const registered = await registeredProviders({
      linkedin: { accessToken: "test-token" },
    });
    expect(
      registered.map(({ entityType, provider, config }) => ({
        entityType,
        provider: provider.name,
        resultIdField: config.publishResultIdField,
      })),
    ).toEqual([
      {
        entityType: "social-post",
        provider: "linkedin",
        resultIdField: "platformPostId",
      },
    ]);
  });

  it("projects AT Protocol social posts", async () => {
    const { harness } = await installed();
    expect(
      harness.getMockShell().getAtprotoProjectionRegistry().get("social-post"),
    ).toMatchObject({ collection: "ai.rizom.brain.socialPost" });
  });
});
