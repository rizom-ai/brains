import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class finds the brain's git
 * broker where its class did, through context.gitBrokerSocket and
 * context.gitBrokerCheckout: directory-sync connects to the checkout's
 * owner there and syncs in its checkout.
 */

async function runtimeOn(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

describe("a first-party service's git broker", () => {
  it("is the brain's broker socket and checkout, as its class read them", async () => {
    const runtime = await runtimeOn(
      createMockShell({
        gitBrokerSocket: "/run/brain/git.sock",
        gitBrokerCheckout: "/data/brain-data",
      }),
    );
    expect(runtime.gitBroker).toEqual({
      socket: "/run/brain/git.sock",
      checkout: "/data/brain-data",
    });
  });

  it("is none on a brain without Git", async () => {
    const runtime = await runtimeOn(createMockShell());
    expect(runtime.gitBroker).toEqual({
      socket: undefined,
      checkout: undefined,
    });
  });
});
