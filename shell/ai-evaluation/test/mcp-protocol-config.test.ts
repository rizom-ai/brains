import { describe, expect, it } from "bun:test";
import { defineBrain } from "@brains/app";
import type {
  Plugin,
  PluginCapabilities,
  ProtocolPluginProvider,
} from "@brains/plugins";
import { resolveEvalConfig } from "../src/eval-config-loader";

const MCP_ID = "@brains/mcp:mcp";
function plugin(id = MCP_ID): Plugin {
  return {
    id,
    version: "1.0.0",
    type: "interface",
    packageName: "@brains/mcp",
    register: async (): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
  };
}
function definition(
  mcp: Plugin,
  disabled = true,
): ReturnType<typeof defineBrain> {
  return defineBrain({
    name: "protocol-eval",
    version: "1.0.0",
    capabilities: [["mcp", (): Plugin => mcp, {}]],
    interfaces: [],
    evalDisable: disabled ? ["mcp"] : [],
  });
}
describe("MCP protocol eval composition", () => {
  it.each([true, false])(
    "replaces the selected host without duplication (disabled=%s)",
    (disabled) => {
      const protocol = plugin();
      const hosted: Plugin & ProtocolPluginProvider = {
        ...plugin(),
        createProtocolPlugin: () => protocol,
      };
      const result = resolveEvalConfig(
        definition(hosted, disabled),
        {},
        { mode: "eval" },
        true,
      );
      expect(result.plugins).toEqual([protocol]);
      expect(result.plugins).not.toContain(hosted);
    },
  );
  it("leaves ordinary evaluation unchanged", () => {
    const hosted = plugin();
    expect(
      resolveEvalConfig(definition(hosted), {}, { mode: "eval" }, false)
        .plugins,
    ).toEqual([]);
    expect(
      resolveEvalConfig(definition(hosted, false), {}, { mode: "eval" }, false)
        .plugins,
    ).toEqual([hosted]);
  });
  it("rejects an unsupported provider rather than substituting a host", () => {
    expect(() =>
      resolveEvalConfig(definition(plugin()), {}, { mode: "eval" }, true),
    ).toThrow("support protocol-only registration");
  });
  it.each([
    { id: "different-id" },
    { packageName: "@other/package" },
    { version: "2.0.0" },
  ])("rejects changed installed identity (%j)", (change) => {
    const hosted: Plugin & ProtocolPluginProvider = {
      ...plugin(),
      createProtocolPlugin: () => ({ ...plugin(), ...change }),
    };
    expect(() =>
      resolveEvalConfig(definition(hosted), {}, { mode: "eval" }, true),
    ).toThrow("preserve its plugin identity");
  });
});
