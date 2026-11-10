import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { createMockAuthBackend } from "../src/test/mock-auth-backend";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service that administers the brain's people reads the auth
 * backend the brain bound, as its class read `context.auth.get()`: when it
 * asks, so a backend bound after the service registered is the one it gets.
 */

async function runtimeOf(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          runtime = serviceRuntime(context);
          return [];
        },
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("No runtime");
  return runtime;
}

describe("a first-party service's auth backend", () => {
  it("is the backend the brain bound, read when asked", async () => {
    const shell = createMockShell();
    const runtime = await runtimeOf(shell);
    expect(runtime.auth()).toBeUndefined();

    const backend = createMockAuthBackend();
    const unbind = shell.getAuthRegistry().bindBackend(backend);
    expect(runtime.auth()).toBe(backend);

    unbind();
    expect(runtime.auth()).toBeUndefined();
  });
});
