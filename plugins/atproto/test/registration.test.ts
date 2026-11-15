import { describe, expect, it } from "bun:test";
import {
  SYSTEM_CHANNELS,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { AtprotoConfigInput } from "../src/config";
import { createAtprotoPlugins } from "./atproto-plugins";

/** The channels the package hears, by the name the bus routes. */
const channels = [
  "publish:completed",
  "entity:created",
  "entity:updated",
  "entity:deleted",
  SYSTEM_CHANNELS.pluginsRegistered,
  SYSTEM_CHANNELS.identityChanged,
] as const;

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  handlers: Record<string, number>;
}

async function installed(
  config: AtprotoConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell({ domain: "brain.example" });
  const plugins = createAtprotoPlugins(config);
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  const handlers = Object.fromEntries(
    channels.map((channel) => [
      channel,
      shell.getMessageBus().getHandlerCount(channel),
    ]),
  );
  return { shell, plugins, capabilities, handlers };
}

const routes = (plugins: Plugin[]): unknown[] =>
  plugins.flatMap((plugin) =>
    (plugin.getWebRoutes?.() ?? []).map(({ path, method, public: open }) => [
      path,
      method,
      open,
    ]),
  );

/**
 * What the atproto package registers, pinned as the atproto plugin class
 * registered it: peers resolve the brain's and its anchor's did:web
 * documents at its routes, the brain card follows the brain's identity and
 * skills, and projected entities follow every publish and change.
 */
describe("the atproto package's registered surface", () => {
  it("is the atproto service, with no tools, resources, instructions or API routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["atproto", "service", "@brains/atproto", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(capabilities.map(({ instructions }) => instructions)).toEqual([
      undefined,
    ]);
    expect(plugins.map((plugin) => plugin.getApiRoutes?.() ?? [])).toEqual([
      [],
    ]);
  });

  it("serves the brain's and its anchor's did:web documents, and nothing when disabled", async () => {
    expect(routes((await installed()).plugins)).toEqual([
      ["/.well-known/did.json", "GET", true],
      ["/anchor/did.json", "GET", true],
    ]);
    expect(
      routes((await installed({}, { executionOnly: true })).plugins),
    ).toEqual([
      ["/.well-known/did.json", "GET", true],
      ["/anchor/did.json", "GET", true],
    ]);
    expect(routes((await installed({ enabled: false })).plugins)).toEqual([]);
  });

  it("hears publishes, entity changes, registration and identity in the main process only", async () => {
    expect((await installed()).handlers).toEqual({
      "publish:completed": 1,
      "entity:created": 1,
      "entity:updated": 2,
      "entity:deleted": 2,
      [SYSTEM_CHANNELS.pluginsRegistered]: 1,
      [SYSTEM_CHANNELS.identityChanged]: 1,
    });
    const none = Object.fromEntries(channels.map((channel) => [channel, 0]));
    expect((await installed({}, { executionOnly: true })).handlers).toEqual(
      none,
    );
    expect((await installed({ enabled: false })).handlers).toEqual(none);
  });
});
