import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
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
