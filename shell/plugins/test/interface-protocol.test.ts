import { expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineInterface } from "../src/public/interface-definition";
import { instantiatePluginPackageDefinition } from "../src/package-definition";
import type { Plugin, ProtocolPluginProvider } from "../src/interfaces";
import { createPluginHarness } from "../test";

function provider(
  plugin: Plugin | undefined,
): plugin is Plugin & ProtocolPluginProvider {
  return (
    plugin !== undefined &&
    "createProtocolPlugin" in plugin &&
    typeof plugin.createProtocolPlugin === "function"
  );
}
const metadata = { name: "@test/protocol", version: "1.0.0" };
it("selects from detached config and never executes hosted lifecycle or surfaces", async () => {
  const observed: number[] = [];
  const hosted = (): never => {
    throw new Error("Hosted callback ran");
  };
  const declaration = defineInterface(
    {
      id: "protocol",
      config: z.object({
        value: z.object({ count: z.number() }),
        secret: z.string(),
      }),
      setup: hosted,
      protocol: (context) => {
        expect(Object.keys(context)).toEqual(["config"]);
        expect(Object.isFrozen(context.config)).toBe(true);
        observed.push(context.config.value.count);
        context.config.value.count++;
        return { mode: "basic", tools: [] };
      },
    },
    {
      tools: hosted,
      routes: hosted,
      daemons: hosted,
      subscriptions: hosted,
      studioWorkspaces: hosted,
      health: hosted,
    },
  );
  const input = { value: { count: 7 }, secret: "HOST_SECRET" };
  const host = instantiatePluginPackageDefinition(
    declaration,
    input,
    metadata,
  )[0];
  if (!provider(host)) throw new Error("Missing provider");
  const first = host.createProtocolPlugin();
  const second = host.createProtocolPlugin();
  expect(first).not.toBe(second);
  expect(observed).toEqual([7, 7]);
  expect(input.value.count).toBe(7);
  for (const protocol of [first, second]) {
    expect(protocol.id).toBe(host.id);
    expect(protocol.packageName).toBe(metadata.name);
    expect(Reflect.get(protocol, "config")).toEqual({ mode: "basic" });
    const harness = createPluginHarness();
    const mode = spyOn(
      harness.getMockShell().getMCPService(),
      "setProtocolMode",
    );
    try {
      expect((await harness.installPlugin(protocol)).tools).toEqual([]);
      await harness.finalizeRegistration();
      expect(mode.mock.calls).toEqual([["basic"]]);
      expect(protocol.getWebRoutes?.()).toEqual([]);
      expect(harness.getMockShell().getDaemonRegistry().getAll()).toEqual([]);
    } finally {
      await harness.reset();
    }
  }
});
it("validates runtime protocol modes before constructing a registration", () => {
  const declaration = defineInterface({
    id: "protocol",
    config: z.object({}),
    protocol: () => {
      const selected = { mode: "basic" as const, tools: [] };
      Reflect.set(selected, "mode", "invalid");
      return selected;
    },
  });
  const host = instantiatePluginPackageDefinition(declaration, {}, metadata)[0];
  if (!provider(host)) throw new Error("Missing provider");
  expect(() => host.createProtocolPlugin()).toThrow();
});
