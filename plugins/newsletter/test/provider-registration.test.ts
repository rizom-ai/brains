import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import type { ReactElement } from "react";
import { newsletterConfigSchema, type NewsletterConfigInput } from "../src";
import { installNewsletter } from "./helpers/install";
import { SUBSCRIBE_PATH } from "../src/routes";

interface PublishRegistration {
  entityType: string;
  provider: { name: string };
  config: { publishResultIdField: string; publishTimestampField: string };
}
interface SlotRegistration {
  pluginId: string;
  slotName: string;
  render: () => ReactElement<{ action?: string; successMessage?: string }>;
}

describe("newsletter provider registration", () => {
  for (const provider of ["buttondown", "resend"] as const) {
    it(`registers ${provider} publishing and its matching signup action`, async () => {
      const harness = createPluginHarness();
      try {
        const publishes: PublishRegistration[] = [];
        const slots: SlotRegistration[] = [];
        harness.subscribe<PublishRegistration>(
          "publish:register",
          async (msg) => {
            publishes.push(msg.payload);
            return { success: true };
          },
        );
        harness.subscribe<SlotRegistration>(
          "plugin:site-builder:slot:register",
          async (msg) => {
            slots.push(msg.payload);
            return { success: true };
          },
        );
        const config: NewsletterConfigInput = {
          provider:
            provider === "buttondown"
              ? {
                  type: "buttondown",
                  apiKey: "buttondown-key",
                  doubleOptIn: true,
                }
              : {
                  type: "resend",
                  apiKey: "resend-key",
                  segmentId: "segment-1",
                  from: "Rizom <newsletter@example.com>",
                },
        };
        const { service } = await installNewsletter(harness, config);
        await harness.sendMessage(
          SYSTEM_CHANNELS.pluginsRegistered,
          { timestamp: new Date().toISOString(), pluginCount: 2 },
          "shell",
          true,
        );
        await service.ready?.();
        expect(publishes).toHaveLength(1);
        expect(publishes[0]).toMatchObject({
          entityType: "newsletter",
          provider: { name: provider },
          config: {
            publishResultIdField:
              provider === "resend" ? "resendBroadcastId" : "buttondownId",
            publishTimestampField: "sentAt",
          },
        });
        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({
          pluginId: "delivery",
          slotName: "footer-top",
        });
        expect(slots[0]?.render().props).toMatchObject({
          action: SUBSCRIBE_PATH,
          successMessage:
            provider === "resend"
              ? "You are subscribed."
              : "Check your email to confirm your subscription.",
        });
        expect(
          service
            .getWebRoutes?.()
            .map(({ path, method }) => ({ path, method })),
        ).toEqual([{ path: SUBSCRIBE_PATH, method: "POST" }]);
      } finally {
        await harness.reset();
      }
    });
  }
  it("rejects incomplete or ambiguous provider config before activation", () => {
    for (const config of [
      { provider: { type: "resend", apiKey: "key" } },
      { provider: { type: "buttondown", apiKey: " " } },
      {
        provider: {
          type: "resend",
          apiKey: "key",
          segmentId: "segment",
          from: "sender",
          doubleOptIn: true,
        },
      },
      { apiKey: "legacy" },
    ])
      expect(newsletterConfigSchema.safeParse(config).success).toBe(false);
  });
  it("registers no provider, subscriber tool or signup route without a provider", async () => {
    const harness = createPluginHarness();
    try {
      const publishes: unknown[] = [];
      harness.subscribe("publish:register", async (msg) => {
        publishes.push(msg.payload);
        return { success: true };
      });
      const { service, capabilities } = await installNewsletter(harness, {});
      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 2 },
        "shell",
        true,
      );
      expect(publishes).toEqual([]);
      expect(capabilities.tools).toEqual([]);
      expect(service.getWebRoutes?.()).toEqual([]);
    } finally {
      await harness.reset();
    }
  });
});
