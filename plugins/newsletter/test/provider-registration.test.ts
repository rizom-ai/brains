import { describe, expect, it } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import {
  siteBuilderSlotsContract,
  type SiteSlotContribution,
} from "@brains/site-composition";
import { SYSTEM_CHANNELS, type Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createButtondownPlugin } from "./newsletter-plugins";
import { createResendPlugin } from "./newsletter-plugins";

interface PublishRegistration {
  entityType: string;
  provider: { name: string };
  config: Record<string, string>;
}

describe("newsletter provider registration", () => {
  it("registers Buttondown publishing and its matching signup action", async () => {
    const harness = createPluginHarness();
    const publishes: PublishRegistration[] = [];
    harness.subscribe<PublishRegistration>(
      publishRegisterContract.name,
      async (msg) => {
        publishes.push(msg.payload);
        return { success: true };
      },
    );
    await harness.installPlugin(
      createButtondownPlugin({ apiKey: "buttondown-key", doubleOptIn: true }),
    );

    await notifyPluginsRegistered(harness);

    expect(publishes[0]).toMatchObject({
      entityType: "newsletter",
      provider: { name: "buttondown" },
    });
    expect(publishes[0]?.config).toEqual({ publishTimestampField: "sentAt" });
    const slots = await slotsInWorker(
      createButtondownPlugin({ apiKey: "buttondown-key", doubleOptIn: true }),
    );
    expect(slots[0]).toMatchObject({
      pluginId: "buttondown",
      slotName: "footer-top",
    });
    expect(slots[0]?.render()?.props).toMatchObject({
      action: "/api/buttondown/subscribe",
      successMessage: "Check your email to confirm your subscription.",
    });
    expect(
      createButtondownPlugin({ apiKey: "buttondown-key" }).getApiRoutes?.()[0]
        ?.tool,
    ).toBe("newsletter_signup");
  });

  it("registers Resend publishing and its matching signup action", async () => {
    const harness = createPluginHarness();
    const publishes: PublishRegistration[] = [];
    harness.subscribe<PublishRegistration>(
      publishRegisterContract.name,
      async (msg) => {
        publishes.push(msg.payload);
        return { success: true };
      },
    );
    await harness.installPlugin(
      createResendPlugin({
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "Rizom <newsletter@example.com>",
      }),
    );

    await notifyPluginsRegistered(harness);

    expect(publishes[0]).toMatchObject({
      entityType: "newsletter",
      provider: { name: "resend" },
    });
    expect(publishes[0]?.config).toEqual({ publishTimestampField: "sentAt" });
    const slots = await slotsInWorker(
      createResendPlugin({
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "Rizom <newsletter@example.com>",
      }),
    );
    expect(slots[0]).toMatchObject({
      pluginId: "resend",
      slotName: "footer-top",
    });
    expect(slots[0]?.render()?.props).toMatchObject({
      action: "/api/resend/subscribe",
      successMessage: "You are subscribed.",
    });
    expect(
      createResendPlugin({
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "newsletter@example.com",
      }).getApiRoutes?.()[0]?.tool,
    ).toBe("newsletter_signup");
  });

  it("registers nothing when a service provider is incomplete", async () => {
    const harness = createPluginHarness();
    const publishes: unknown[] = [];
    harness.subscribe(publishRegisterContract.name, async (msg) => {
      publishes.push(msg.payload);
      return { success: true };
    });
    const capabilities = await harness.installPlugin(
      createResendPlugin({ apiKey: "resend-key" }),
    );

    await notifyPluginsRegistered(harness);

    expect(publishes).toEqual([]);
    expect(capabilities.tools).toEqual([]);
    expect(
      createResendPlugin({ apiKey: "resend-key" }).getApiRoutes?.(),
    ).toEqual([]);
  });
});

async function notifyPluginsRegistered(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<void> {
  await harness.sendMessage(
    SYSTEM_CHANNELS.pluginsRegistered,
    { timestamp: new Date().toISOString(), pluginCount: 1 },
    "shell",
    true,
  );
}

// Site builds run in the worker process, which registers plugins but never
// emits pluginsRegistered; the signup slot has to answer there.
async function slotsInWorker(plugin: Plugin): Promise<SiteSlotContribution[]> {
  const shell = createPluginHarness().getMockShell();
  await plugin.register(shell, { executionOnly: true });
  const answers = await shell.getMessageBus().collect({
    type: siteBuilderSlotsContract.name,
    payload: {},
    sender: "site-builder",
  });
  return answers.flatMap((answer) =>
    "data" in answer
      ? siteBuilderSlotsContract.response.parse(answer.data)
      : [],
  );
}
