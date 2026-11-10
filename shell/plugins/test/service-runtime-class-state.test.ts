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
 * A first-party service converted from a class keeps the runtime state its
 * class stored, under the namespace the class named (`playbooks.runs`),
 * not the one a package's setup qualifies by its package name, so the
 * records stored before the conversion are the ones it reads after.
 */

const runSchema = z.object({ id: z.string(), state: z.string() });

async function install(shell: MockShell): Promise<{
  runtime: ServiceRuntime;
  qualified: (namespace: string) => Promise<unknown[]>;
}> {
  let runtime: ServiceRuntime | undefined;
  let setupState:
    | Parameters<
        NonNullable<Parameters<typeof defineServicePlugin>[0]["setup"]>
      >[0]["runtimeState"]
    | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      {
        id: "playbooks",
        config: z.object({}),
        setup: ({ runtimeState }) => {
          setupState = runtimeState;
          return {};
        },
      },
      {
        subscriptions: (context) => {
          runtime = serviceRuntime(context);
          return [];
        },
      },
    ),
    {},
    { name: "@brains/playbooks", version: "0.1.0" },
    { pluginId: "playbooks" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime || !setupState) throw new Error("No runtime");
  const qualifiedState = setupState;
  return {
    runtime,
    qualified: async (namespace) =>
      (await qualifiedState({ namespace, schema: runSchema }).list()).map(
        ({ value }) => value,
      ),
  };
}

describe("a first-party service's class runtime state", () => {
  it("reads and writes under the namespace its class named", async () => {
    const shell = createMockShell();
    // A run the class stored before the conversion.
    await shell
      .getRuntimeState()
      .scoped({ namespace: "playbooks.runs", schema: runSchema })
      .set("run-1", { id: "run-1", state: "welcome" });
    const { runtime, qualified } = await install(shell);
    const runs = runtime.classRuntimeState.scoped({
      namespace: "playbooks.runs",
      schema: runSchema,
    });

    expect(await runs.get("run-1")).toEqual({ id: "run-1", state: "welcome" });
    await runs.set("run-2", { id: "run-2", state: "seed" });
    expect(
      (
        await shell
          .getRuntimeState()
          .scoped({ namespace: "playbooks.runs", schema: runSchema })
          .list()
      ).map(({ key }) => key),
    ).toEqual(["run-1", "run-2"]);
    // The package-qualified store a declared setup is given is another one.
    expect(await qualified("runs")).toEqual([]);
  });
});
