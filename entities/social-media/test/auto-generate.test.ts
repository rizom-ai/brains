import { describe, expect, it, mock } from "bun:test";
import type { PluginCapabilities } from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { SocialMediaPlugin } from "../src/plugin";

async function install(config: {
  autoGenerateOnBlogPublish: boolean;
}): Promise<{
  capabilities: PluginCapabilities;
  enqueue: ReturnType<typeof mock>;
  harness: PluginTestHarness<SocialMediaPlugin>;
}> {
  const harness = createPluginHarness<SocialMediaPlugin>({
    dataDir: `/tmp/test-social-media-${String(config.autoGenerateOnBlogPublish)}`,
  });
  const enqueue = mock(async () => "job-1");
  const jobQueue = harness.getMockShell().getJobQueueService();
  harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
    ...jobQueue,
    enqueue,
  });
  const capabilities = await harness.installPlugin(
    new SocialMediaPlugin(config),
  );
  return { capabilities, enqueue, harness };
}

describe("SocialMediaPlugin projection scheduling boundary", () => {
  it("does not register a projection rule when auto generation is disabled", async () => {
    const { capabilities } = await install({
      autoGenerateOnBlogPublish: false,
    });

    expect(capabilities.projectionRules).toBeUndefined();
    expect(capabilities.projections).toBeUndefined();
  });

  it("registers one scheduler-owned rule and no event-driven auto-generation", async () => {
    const { capabilities, enqueue, harness } = await install({
      autoGenerateOnBlogPublish: true,
    });

    expect(capabilities.projections).toBeUndefined();
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "social-post-generation",
      sources: [{ kind: "entity", types: ["post"] }],
      targetType: "social-post",
    });

    await harness.sendMessage("entity:updated", {
      entityType: "post",
      entityId: "post-1",
      entity: { metadata: { status: "queued" } },
    });
    await harness.sendMessage("social:auto-generate", {
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      platform: "linkedin",
    });

    expect(enqueue).not.toHaveBeenCalled();
  });
});
