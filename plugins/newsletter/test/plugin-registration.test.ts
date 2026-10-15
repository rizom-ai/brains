import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import {
  baseEntitySchema,
  createPluginHarness,
  createTestEntityAdapter,
  refuseEnqueues,
} from "@brains/plugins/test";
import { waitUntil } from "@brains/test-utils";
import { NewsletterPlugin } from "../src/entity/plugin";

describe("NewsletterPlugin registration", () => {
  it("declares newsletter publish statuses and secondary topic authority", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-policy",
    });

    const capabilities = await harness.installPlugin(new NewsletterPlugin({}));

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("newsletter"),
    ).toMatchObject({
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    });
    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toBeUndefined();
  });

  it("does not register a delivery provider itself", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-publish-registration",
    });
    const messages: unknown[] = [];
    harness.subscribe("publish:register", async (msg) => {
      messages.push(msg.payload);
      return { success: true };
    });
    await harness.installPlugin(new NewsletterPlugin({}));

    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );

    expect(messages).toEqual([]);
  });
});

describe("NewsletterPlugin scheduled generation", () => {
  it("queues a scheduled generation the queue refused once it admits it", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-refused-generation",
    });
    harness
      .getEntityRegistry()
      .registerEntityType(
        "post",
        baseEntitySchema,
        createTestEntityAdapter("post"),
      );
    await harness.getEntityService().createEntity({
      entity: {
        id: "post-1",
        entityType: "post",
        content: "A post",
        visibility: "public",
        metadata: { status: "published" },
      },
    });
    const queue = harness.getMockShell().getJobQueueService();
    const refusals = refuseEnqueues(queue, 1);
    await harness.installPlugin(new NewsletterPlugin({}));

    await harness.sendMessage("generate:execute", {
      entityType: "newsletter",
    });
    expect(refusals.count).toBe(1);

    await waitUntil(
      async () =>
        (await queue.getActiveJobs()).some((job) =>
          job.type.includes("generation"),
        ),
      "the refused generation to be queued",
      { timeoutMs: 5_000 },
    );
    await harness.reset();
  });
});
