import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { ServicePlugin } from "../src/service/service-plugin";
import { createPluginHarness } from "../src/test/harness";
import type { ServicePluginContext } from "../src/service/context";
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
  it("exposes plugin-scoped registration through the base context", async () => {
    class ChannelPlugin extends ServicePlugin<
      Record<string, never>,
      Record<string, never>
    > {
      constructor() {
        super(
          "channel-test",
          { name: "channel-test", version: "1.0.0" },
          {},
          z.object({}),
        );
      }

      protected override async onRegister(
        context: ServicePluginContext,
      ): Promise<void> {
        context.channels.registerDescriptor({
          type: "email",
          displayName: "Email",
          subjectLabel: "Email address",
        });
        context.channels.registerDeliveryProvider(emailProvider());
      }
    }

    const harness = createPluginHarness<ChannelPlugin>();
    await harness.installPlugin(new ChannelPlugin());
    await harness.finalizeRegistration();

    expect(
      harness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([
      {
        type: "email",
        displayName: "Email",
        subjectLabel: "Email address",
      },
    ]);
  });

  it("finalizes serializable descriptors separately from operational providers", async () => {
    const registry = new ChannelRegistry();
    registry.registerDescriptor("notifications", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
      subjectPattern: { source: "^[^@]+@[^@]+$", flags: "i" },
      manualDelivery: true,
    });
    registry.registerDeliveryProvider("email-resend", emailProvider());

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

  it("fails finalization deterministically for duplicate owners or orphan providers", () => {
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
    orphan.registerDeliveryProvider("email-resend", emailProvider());
    expect(() => orphan.finalize()).toThrow(
      'Delivery provider for channel "email" has no descriptor',
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

    registry.registerDescriptor("notifications", {
      type: "email",
      displayName: "Email",
      subjectLabel: "Email address",
    });
    registry.registerDeliveryProvider("email-resend", emailProvider());
    registry.unregisterPlugin("email-resend");
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
