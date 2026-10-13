import { describe, expect, it } from "bun:test";
import {
  SYSTEM_CHANNELS,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { defineServicePlugin, z } from "@brains/sdk/services";
import { createPluginHarness } from "@brains/plugins/test";
import { newsletterConfigSchema, type NewsletterConfigInput } from "../src";
import {
  installNewsletter,
  instantiate,
  SERVICE_PLUGIN_ID,
} from "./helpers/install";
import { SUBSCRIBE_PATH } from "../src/routes";

interface PublishRegistration {
  entityType: string;
  provider: { name: string };
  config: { publishResultIdField: string; publishTimestampField: string };
}
interface SlotRegistration {
  pluginId: string;
  slotName: string;
  props: unknown;
}

async function slotReader(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<(signal: AbortSignal) => Promise<readonly SlotRegistration[]>> {
  let read: (
    signal: AbortSignal,
  ) => Promise<readonly SlotRegistration[]> = async () => {
    throw new Error("Reader not installed");
  };
  const definition = defineServicePlugin({
    id: "reader",
    config: z.object({}),
    setup: ({ siteContributions }) => {
      read = (signal): Promise<readonly SlotRegistration[]> =>
        siteContributions.withSlots(signal, async (slots) =>
          slots.map((slot) => ({
            pluginId: slot.pluginId,
            slotName: slot.slotName,
            props: slot.render()?.props,
          })),
        );
      return {};
    },
  });
  const [reader] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reader", version: "1" },
  );
  if (!reader) throw new Error("Missing reader");
  await harness.installPlugin(reader);
  return read;
}

describe("newsletter provider registration", () => {
  for (const provider of ["buttondown", "resend", undefined] as const) {
    it(`contributes ${provider ?? "no"} signup in workers without ready or pluginsRegistered`, async () => {
      const harness = createPluginHarness();
      try {
        const config: NewsletterConfigInput = {
          provider:
            provider === "buttondown"
              ? { type: "buttondown", apiKey: "synthetic", doubleOptIn: true }
              : provider === "resend"
                ? {
                    type: "resend",
                    apiKey: "synthetic",
                    segmentId: "fixture",
                    from: "sender@example.test",
                  }
                : undefined,
        };
        const { entity, service } = instantiate(config);
        await harness.installPlugin(entity);
        const register = service.register.bind(service);
        service.register = (shell, options): ReturnType<typeof register> =>
          register(shell, { ...options, executionOnly: true });
        await harness.installPlugin(service);
        const read = await slotReader(harness);
        const slots = await read(new AbortController().signal);
        expect(slots).toHaveLength(provider ? 1 : 0);
        if (provider) {
          expect(slots[0]?.pluginId).toBe(SERVICE_PLUGIN_ID);
          expect(slots[0]?.props).toMatchObject({
            action: SUBSCRIBE_PATH,
            successMessage:
              provider === "resend"
                ? "You are subscribed."
                : "Check your email to confirm your subscription.",
          });
        }
      } finally {
        await harness.reset();
      }
    });
  }
  for (const provider of ["buttondown", "resend"] as const) {
    it(`registers ${provider} publishing and its matching signup action`, async () => {
      const harness = createPluginHarness();
      try {
        const publishes: PublishRegistration[] = [];
        const readSlots = await slotReader(harness);
        harness.subscribe<PublishRegistration>(
          "publish:register",
          async (msg) => {
            publishes.push(msg.payload);
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
        const slots = await readSlots(new AbortController().signal);
        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({
          pluginId: SERVICE_PLUGIN_ID,
          slotName: "footer-top",
        });
        expect(slots[0]?.props).toMatchObject({
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
