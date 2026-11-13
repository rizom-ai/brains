import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

type Plugin = NonNullable<
  ReturnType<typeof instantiatePluginPackageDefinition>[number]
>;

/** A declared service, with the agent instructions it gives, if any. */
function service(id: string, instructions?: string): Plugin {
  const header = {
    id,
    config: z.object({}),
    setup: (): Record<never, never> => ({}),
  };
  const [plugin] = instantiatePluginPackageDefinition(
    instructions === undefined
      ? defineServicePlugin(header)
      : defineServicePlugin(header, { instructions: () => instructions }),
    {},
    { name: `@fixture/${id}`, version: "1.0.0" },
  );
  if (!plugin) throw new Error(`No plugin ${id}`);
  return plugin;
}

describe("Plugin Instructions", () => {
  it("includes a service's instructions in its capabilities", async () => {
    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(
      service("instructed", "Always greet the user before responding."),
    );

    expect(capabilities.instructions).toBe(
      "Always greet the user before responding.",
    );
  });

  it("includes no instructions when a service gives none", async () => {
    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(service("plain"));

    expect(capabilities.instructions).toBeUndefined();
  });
});
