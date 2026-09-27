import { describe, expect, it } from "bun:test";
import { defineBrain } from "@brains/app";
import type {
  Plugin,
  PluginCapabilities,
  ProtocolPluginProvider,
} from "@brains/plugins";
import { resolveEvalConfig } from "../src/eval-config-loader";

function plugin(id: string): Plugin {
  return {
    id,
    version: "1.0.0",
    type: "interface",
    packageName: "@test/mcp",
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
    "uses the selected provider without retaining or duplicating its host (disabled=%s)",
    (disabled) => {
      const protocol = plugin("mcp");
      const hosted: Plugin & ProtocolPluginProvider = {
        ...plugin("mcp"),
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

  it("leaves ordinary eval composition unchanged", () => {
    const hosted = plugin("mcp");
    expect(
      resolveEvalConfig(definition(hosted), {}, { mode: "eval" }, false)
        .plugins,
    ).toEqual([]);
    expect(
      resolveEvalConfig(definition(hosted, false), {}, { mode: "eval" }, false)
        .plugins,
    ).toEqual([hosted]);
  });

  it("rejects an unsupported provider instead of substituting another implementation or host", () => {
    expect(() =>
      resolveEvalConfig(definition(plugin("mcp")), {}, { mode: "eval" }, true),
    ).toThrow("support protocol-only registration");
  });

  it("rejects a provider that changes plugin identity", () => {
    const hosted: Plugin & ProtocolPluginProvider = {
      ...plugin("mcp"),
      createProtocolPlugin: () => plugin("different-id"),
    };
    expect(() =>
      resolveEvalConfig(definition(hosted), {}, { mode: "eval" }, true),
    ).toThrow("preserve its plugin identity");
  });
});
