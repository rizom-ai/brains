import { describe, expect, it, mock } from "bun:test";
import type { PluginCapabilities } from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { SocialMediaPlugin } from "../src/plugin";

async function install(): Promise<{
  capabilities: PluginCapabilities;
  enqueue: ReturnType<typeof mock>;
  harness: PluginTestHarness<SocialMediaPlugin>;
}> {
  const harness = createPluginHarness<SocialMediaPlugin>({
    dataDir: "/tmp/test-social-media",
  });
  const enqueue = mock(async () => "job-1");
  const jobQueue = harness.getMockShell().getJobQueueService();
  harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
    ...jobQueue,
    enqueue,
  });
  const capabilities = await harness.installPlugin(new SocialMediaPlugin({}));
  return { capabilities, enqueue, harness };
}

describe("SocialMediaPlugin projection scheduling boundary", () => {
  // Social posts are generated only when something explicitly asks for them,
  // through generate:execute. The package does not derive them from blog
  // activity, so it contributes no projection rule at all.
  it("registers no projection rule", async () => {
    const { capabilities } = await install();

    expect(capabilities.projectionRules).toBeUndefined();
    expect("projections" in capabilities).toBe(false);
  });

  it("does not auto-generate from blog post activity", async () => {
    const { enqueue, harness } = await install();

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
