import { describe, expect, it } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import {
  siteBuilderSlotsContract,
  type SiteSlotContribution,
} from "@brains/site-composition";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { ButtondownPlugin } from "../src/provider/plugin";
import { ResendPlugin } from "../src/provider/resend/plugin";

interface PublishRegistration {
  entityType: string;
  provider: { name: string };
  config: Record<string, string>;
}

describe("newsletter provider registration", () => {
  it("registers Buttondown publishing and its matching signup action", async () => {
    const harness = createPluginHarness<ButtondownPlugin>();
    const publishes: PublishRegistration[] = [];
    harness.subscribe<PublishRegistration>(
      publishRegisterContract.name,
      async (msg) => {
        publishes.push(msg.payload);
        return { success: true };
      },
    );
    await harness.installPlugin(
      new ButtondownPlugin({ apiKey: "buttondown-key", doubleOptIn: true }),
    );

    await notifyPluginsRegistered(harness);

    expect(publishes[0]).toMatchObject({
      entityType: "newsletter",
      provider: { name: "buttondown" },
    });
    expect(publishes[0]?.config).toEqual({ publishTimestampField: "sentAt" });
    const slots = await slotsInWorker(
      new ButtondownPlugin({ apiKey: "buttondown-key", doubleOptIn: true }),
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
      new ButtondownPlugin({ apiKey: "buttondown-key" }).getApiRoutes()[0]
        ?.tool,
    ).toBe("newsletter_signup");
  });

  it("registers Resend publishing and its matching signup action", async () => {
    const harness = createPluginHarness<ResendPlugin>();
    const publishes: PublishRegistration[] = [];
    harness.subscribe<PublishRegistration>(
      publishRegisterContract.name,
      async (msg) => {
        publishes.push(msg.payload);
        return { success: true };
      },
    );
    await harness.installPlugin(
      new ResendPlugin({
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
      new ResendPlugin({
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
      new ResendPlugin({
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "newsletter@example.com",
      }).getApiRoutes()[0]?.tool,
    ).toBe("newsletter_signup");
  });

  it("registers nothing when a service provider is incomplete", async () => {
    const harness = createPluginHarness<ResendPlugin>();
    const publishes: unknown[] = [];
    harness.subscribe(publishRegisterContract.name, async (msg) => {
      publishes.push(msg.payload);
      return { success: true };
    });
    const capabilities = await harness.installPlugin(
      new ResendPlugin({ apiKey: "resend-key" }),
    );

    await notifyPluginsRegistered(harness);

    expect(publishes).toEqual([]);
    expect(capabilities.tools).toEqual([]);
    expect(new ResendPlugin({ apiKey: "resend-key" }).getApiRoutes()).toEqual(
      [],
    );
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
async function slotsInWorker(
  plugin: ButtondownPlugin | ResendPlugin,
): Promise<SiteSlotContribution[]> {
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
