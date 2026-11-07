import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineMessageInterface,
  defineMessageInterfacePackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * One package, several message interfaces: which of them run is a fact about
 * the package's config, and each is its own interface with its own channel.
 */
const config = z.object({
  discord: z.object({ token: z.string() }).optional(),
  slack: z.object({ token: z.string() }).optional(),
});

const cursor = z.object({ at: z.string() });

function platform(
  type: "discord" | "slack",
): ReturnType<typeof defineMessageInterface<typeof config>> {
  return defineMessageInterface(
    {
      id: type,
      config,
      channel: {
        type,
        displayName: type === "discord" ? "Discord" : "Slack",
        subjectLabel: "User",
        recipient: z.string(),
      },
      setup: ({ runtimeState }) => ({
        cursor: runtimeState({ namespace: "cursor", schema: cursor }),
      }),
    },
    {
      async deliver({ config: enabled, state, recipient }) {
        await state.cursor.set(type, { at: recipient });
        return enabled[type]?.token;
      },
    },
  );
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
    // Credentials for one platform: one interface, not a second that could
    // only fail to connect.
    expect(
      instantiatePluginPackageDefinition(
        chat,
        { slack: { token: "s" } },
        METADATA,
      ).map((plugin) => plugin.id),
    ).toEqual(["@fixture/chat:slack"]);
    expect(instantiatePluginPackageDefinition(chat, {}, METADATA)).toEqual([]);
  });

  it("registers each interface's channel as its own type, with the package's parsed config", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    for (const plugin of instantiatePluginPackageDefinition(
      chat,
      both,
      METADATA,
    )) {
      await harness.installPlugin(plugin);
    }
    await harness.finalizeRegistration();

    const channels = harness.getMockShell().getChannelRegistry();
    expect(channels.getDescriptor("discord")?.displayName).toBe("Discord");
    expect(channels.getDescriptor("slack")?.displayName).toBe("Slack");
    expect(
      await channels.getDeliveryProvider("slack")?.send({
        recipient: "ops",
        subject: "Ping",
        text: "Ping",
        idempotencyKey: "ping-1",
      }),
    ).toEqual({ status: "sent", providerDeliveryId: "s" });
    await harness.reset();
  });

  it("keeps every interface's state under the one package that owns them", async () => {
    const harness = createPluginHarness({ logger: createSilentLogger() });
    for (const plugin of instantiatePluginPackageDefinition(
      chat,
      both,
      METADATA,
    )) {
      await harness.installPlugin(plugin);
    }
    await harness.finalizeRegistration();
    const channels = harness.getMockShell().getChannelRegistry();
    for (const type of ["discord", "slack"]) {
      await channels.getDeliveryProvider(type)?.send({
        recipient: `${type}-room`,
        subject: "Ping",
        text: "Ping",
        idempotencyKey: `${type}-1`,
      });
    }

    // One owner, one namespace: the package's interfaces choose distinct keys
    // or distinct namespaces for what they keep apart.
    const stored = harness
      .getMockShell()
      .getRuntimeState()
      .scoped({ namespace: "fixture.chat.cursor", schema: cursor });
    expect(await stored.get("discord")).toEqual({ at: "discord-room" });
    expect(await stored.get("slack")).toEqual({ at: "slack-room" });
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

  it("refuses an interface declared over another config schema", () => {
    const elsewhere = defineMessageInterface(
      {
        id: "elsewhere",
        config: z.object({ token: z.string() }),
        channel: {
          type: "elsewhere",
          displayName: "Elsewhere",
          subjectLabel: "User",
          recipient: z.string(),
        },
      },
      { deliver: () => undefined },
    );
    const mixed = defineMessageInterfacePackage({
      id: "mixed",
      config,
      // @ts-expect-error Every interface in a package is declared over its config.
      interfaces: () => [elsewhere],
    });
    expect(() =>
      instantiatePluginPackageDefinition(mixed, both, METADATA),
    ).toThrow(
      'Message interface package "mixed" declares "elsewhere" over a config schema other than its own',
    );
  });

  it("refuses an interface that is not a message interface", () => {
    const webhook = defineInterface({ id: "webhook", config });
    const mixed = defineMessageInterfacePackage({
      id: "mixed",
      config,
      // @ts-expect-error A message interface package holds message interfaces.
      interfaces: () => [webhook],
    });
    expect(() =>
      instantiatePluginPackageDefinition(mixed, both, METADATA),
    ).toThrow(
      'Message interface package "mixed" declares "webhook", which is not a message interface',
    );
  });

  it("refuses a package of interfaces inside another", () => {
    const nested = defineMessageInterfacePackage({
      id: "outer",
      config,
      interfaces: () => [chat],
    });
    expect(() =>
      instantiatePluginPackageDefinition(nested, both, METADATA),
    ).toThrow(
      'Message interface package "outer" declares package "chat"; list its interfaces instead',
    );
  });
});
