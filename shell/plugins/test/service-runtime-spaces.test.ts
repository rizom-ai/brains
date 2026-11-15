import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the brain's shared
 * conversation spaces as its class read context.spaces: the selectors the
 * brain is configured with, as a list nobody can change through it.
 */

async function runtimeWith(spaces?: string[]): Promise<ServiceRuntime> {
  const shell = createMockShell(spaces ? { spaces } : {});
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({ id: "probe", config: z.object({}) }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  await plugin?.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

describe("a first-party service reading the brain's spaces as its class did", () => {
  it("reads the spaces the brain is configured with", async () => {
    const runtime = await runtimeWith(["discord:123", "slack:team/*"]);

    expect(runtime.spaces).toEqual(["discord:123", "slack:team/*"]);
  });

  it("reads none on a brain configured with none", async () => {
    expect((await runtimeWith()).spaces).toEqual([]);
  });

  it("hands out a list nobody can change through it", async () => {
    const runtime = await runtimeWith(["discord:123"]);

    expect(Object.isFrozen(runtime.spaces)).toBe(true);
  });
});
