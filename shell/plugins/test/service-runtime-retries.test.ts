import { describe, expect, it } from "bun:test";
import { RetryScope } from "@brains/utils/retry-backoff";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class retries work a refusal
 * must not lose as its class did through `this.retries`: a refused
 * attempt is retried, and shutting the package down stops every retry it
 * owns. Content-pipeline retries a refused publish asset job this way.
 */

async function runtimeOn(shell: MockShell): Promise<{
  runtime: ServiceRuntime;
  plugin: Plugin;
}> {
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
  return { runtime, plugin };
}

describe("a first-party service's retries", () => {
  it("retry a refused attempt until the package shuts down", async () => {
    const { runtime, plugin } = await runtimeOn(createMockShell());
    const attempts: number[] = [];
    const attempt = async (): Promise<void> => {
      attempts.push(attempts.length);
      throw new Error("Write lock held");
    };

    const outcome = runtime.retries.retry(
      attempt,
      new Error("Write lock held"),
      "queue the asset job",
    );
    await plugin.shutdown?.();

    // Shutting down stops the retry before its first backoff elapses.
    expect(await outcome).toEqual({ kind: "stopped" });
    expect(attempts).toEqual([]);
  });

  it("is one scope for the package, wherever its runtime is read", async () => {
    let first: ServiceRuntime | undefined;
    let second: ServiceRuntime | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "probe",
          config: z.object({}),
          setup: (context) => {
            first = serviceRuntime(context);
            return {};
          },
        },
        {
          subscriptions: (context) => {
            second = serviceRuntime(context);
            return [];
          },
        },
      ),
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    await plugin?.register(createMockShell());

    expect(first?.retries).toBeInstanceOf(RetryScope);
    expect(first?.retries).toBe(second?.retries);
  });
});
