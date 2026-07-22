import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { NewsletterPlugin } from "../src/entity/plugin";

describe("NewsletterPlugin - Publish Pipeline Integration", () => {
  it("declares newsletter publish statuses and secondary topic authority", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-policy",
    });

    await harness.installPlugin(new NewsletterPlugin({}));

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("newsletter"),
    ).toMatchObject({
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    });
  });

  it("registers provider-mode publishing config", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-publish-registration",
    });
    const messages: Array<{ type: string; payload: unknown }> = [];
    harness.subscribe("publish:register", async (msg) => {
      messages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
    await harness.installPlugin(new NewsletterPlugin({}));

    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );

    expect(messages[0]?.payload).toMatchObject({
      entityType: "newsletter",
      provider: { name: "internal" },
      config: {
        publishResultIdField: "buttondownId",
        publishTimestampField: "sentAt",
      },
    });
  });
});
