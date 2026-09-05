import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  defineMessageInterfacePackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * One package, several message interfaces.
 *
 * chat serves Discord and Slack from one config block, and each is its own
 * interface type: permission rules, channel descriptors and conversation ids
 * are keyed per platform. A declaration is one channel, so the package
 * declares one interface per platform it holds credentials for — the way a
 * service package emits an entity plugin per declared type.
 */

const config = z.object({
  discord: z.object({ token: z.string() }).optional(),
  slack: z.object({ token: z.string() }).optional(),
});

function platform(
  type: "discord" | "slack",
): ReturnType<typeof defineMessageInterface<typeof config>> {
  return defineMessageInterface({
    id: type,
    config,
    channel: {
      type,
      displayName: type === "discord" ? "Discord" : "Slack",
      subjectLabel: "User",
      recipient: z.string(),
    },
  });
}

const chat = defineMessageInterfacePackage({
  id: "chat",
  config,
  interfaces: ({ config: enabled }) => [
    ...(enabled.discord ? [platform("discord")] : []),
    ...(enabled.slack ? [platform("slack")] : []),
  ],
});

const METADATA = { name: "@fixture/chat", version: "0.1.0" };
const both = { discord: { token: "d" }, slack: { token: "s" } };

describe("a package declaring several message interfaces", () => {
  it("emits one interface plugin per interface its config enables", () => {
    expect(
      instantiatePluginPackageDefinition(chat, both, METADATA).map(
        (plugin) => plugin.id,
      ),
    ).toEqual(["@fixture/chat:discord", "@fixture/chat:slack"]);

    // Credentials for one platform: one interface, not one interface plus
    // another that could only fail to connect.
    expect(
      instantiatePluginPackageDefinition(
        chat,
        { slack: { token: "s" } },
        METADATA,
      ).map((plugin) => plugin.id),
    ).toEqual(["@fixture/chat:slack"]);
  });

  it("registers each interface's channel as its own type", async () => {
    const harness = createPluginHarness();
    for (const plugin of instantiatePluginPackageDefinition(
      chat,
      both,
      METADATA,
    )) {
      await harness.installPlugin(plugin);
    }
    await harness.finalizeRegistration();

    const registry = harness.getMockShell().getChannelRegistry();
    expect(registry.getDescriptor("discord")?.displayName).toBe("Discord");
    expect(registry.getDescriptor("slack")?.displayName).toBe("Slack");
    await harness.reset();
  });

  it("refuses to declare the same interface twice", () => {
    const doubled = defineMessageInterfacePackage({
      id: "chat",
      config,
      interfaces: () => [platform("slack"), platform("slack")],
    });

    expect(() =>
      instantiatePluginPackageDefinition(doubled, both, METADATA),
    ).toThrow('Message interface package "chat" declares "slack" twice');
  });
});
