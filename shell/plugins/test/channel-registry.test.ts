import { describe, expect, it } from "bun:test";
import {
  createInterfacePluginContext,
  createMessageInterfacePluginContext,
} from "../src/interface/context";
import { createServicePluginContext } from "../src/service/context";
import { createMockShell } from "../src/test/mock-shell";
import {
  ChannelRegistry,
  type ChannelDeliveryProvider,
} from "../src/channel-registry";

function emailProvider(): ChannelDeliveryProvider {
  return {
    channelType: "email",
    isAvailable: async () => true,
    send: async () => ({ status: "sent", providerDeliveryId: "email_1" }),
  };
}

describe("ChannelRegistry", () => {
  it("does not expose channel registration to services", () => {
    const context = createServicePluginContext(createMockShell(), "service");
    expect("registerDescriptor" in context.channels).toBe(false);
    expect("registerDeliveryProvider" in context.channels).toBe(false);
  });

  it("does not expose channel registration to non-message interfaces", () => {
    const context = createInterfacePluginContext(createMockShell(), "web");
    expect("registerDescriptor" in context.channels).toBe(false);
    expect("registerDeliveryProvider" in context.channels).toBe(false);
  });

  it("exposes plugin-scoped channel registration only to message interfaces", () => {
    const shell = createMockShell();
    const context = createMessageInterfacePluginContext(shell, "channel-test");
    context.channels.registerDescriptor({
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    context.channels.registerDeliveryProvider(emailProvider());
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([
      {
        type: "email",
        displayName: "Email",
        subjectLabel: "Email address",
      },
    ]);
  });

  it("finalizes serializable descriptors separately from operational providers", async () => {
    const registry = new ChannelRegistry();
    registry.registerDescriptor("email", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
      subjectPattern: { source: "^[^@]+@[^@]+$", flags: "i" },
      manualDelivery: true,
    });
    registry.registerDeliveryProvider("email", emailProvider());

    registry.finalize();

    expect(registry.listDescriptors()).toEqual([
      {
        type: "email",
        displayName: "Email",
        subjectLabel: "Email address",
        subjectPattern: { source: "^[^@]+@[^@]+$", flags: "i" },
        manualDelivery: true,
      },
    ]);
    expect(registry.getDescriptor("email")).toMatchObject({
      displayName: "Email",
    });
    expect(await registry.getDeliveryProvider("email")?.isAvailable()).toBe(
      true,
    );
  });

  it("supports several channel types from one plugin", () => {
    const registry = new ChannelRegistry();
    registry.registerDescriptor("chat", {
      type: "discord",
      displayName: "Discord",
      subjectLabel: "Discord user ID",
    });
    registry.registerDescriptor("chat", {
      type: "slack",
      displayName: "Slack",
      subjectLabel: "Slack member ID",
    });

    registry.finalize();

    expect(registry.listDescriptors().map((item) => item.type)).toEqual([
      "discord",
      "slack",
    ]);
  });

  it("fails finalization deterministically for duplicate, orphan, or split owners", () => {
    const duplicate = new ChannelRegistry();
    duplicate.registerDescriptor("first", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    duplicate.registerDescriptor("second", {
      type: "email",
      displayName: "Mail",
      subjectLabel: "Mail address",
    });
    expect(() => duplicate.finalize()).toThrow(
      'Channel "email" is registered by multiple plugins: first, second',
    );

    const orphan = new ChannelRegistry();
    orphan.registerDeliveryProvider("email", emailProvider());
    expect(() => orphan.finalize()).toThrow(
      'Delivery provider for channel "email" has no descriptor',
    );

    const splitOwner = new ChannelRegistry();
    splitOwner.registerDescriptor("email", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    splitOwner.registerDeliveryProvider("transport-plugin", emailProvider());
    expect(() => splitOwner.finalize()).toThrow(
      'Delivery provider for channel "email" must be registered by descriptor owner "email", not "transport-plugin"',
    );
  });

  it("validates metadata, freezes registration, and releases plugin-owned state", () => {
    const registry = new ChannelRegistry();
    expect(() =>
      registry.registerDescriptor("bad", {
        type: "Email",
        displayName: "Email",
        subjectLabel: "Email address",
      }),
    ).toThrow();

    registry.registerDescriptor("email", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    registry.registerDeliveryProvider("email", emailProvider());
    registry.unregisterPlugin("email");
    registry.finalize();

    expect(registry.getDeliveryProvider("email")).toBeUndefined();
    expect(() =>
      registry.registerDescriptor("late", {
        type: "discord",
        displayName: "Discord",
        subjectLabel: "Discord user ID",
      }),
    ).toThrow("Channel registration is closed");
  });
});
