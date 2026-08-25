import { describe, expect, it } from "bun:test";
import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import agentDiscovery, { agentDiscoveryConfigSchema } from "../src";

const PACKAGE_METADATA = {
  name: "@brains/agent-discovery",
  version: "0.1.0",
};

async function install(
  config: Record<string, unknown> = {},
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("agent-discovery"),
    dataDir: "/tmp/test-datadir",
  });
  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    config,
    PACKAGE_METADATA,
  );
  for (const plugin of plugins as Plugin[]) await harness.installPlugin(plugin);
  return harness;
}

describe("agent discovery package", () => {
  it("registers the two directory types", async () => {
    const harness = await install();

    const types = harness.getEntityService().getEntityTypes();
    expect(types).toContain("agent");
    expect(types).toContain("skill");

    // An agent is evidence a skill is derived from; a skill is the end of
    // that chain and sources nothing further.
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("agent"),
    ).toMatchObject({ projectionSourceRole: "supporting" });
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("skill"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("offers the three directory tools", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("agent-discovery-tools"),
    });
    const plugins = instantiatePluginPackageDefinition(
      agentDiscovery,
      {},
      PACKAGE_METADATA,
    );
    const names: string[] = [];
    for (const plugin of plugins as Plugin[]) {
      const capabilities = await harness.installPlugin(plugin);
      names.push(...capabilities.tools.map(({ name }) => name));
    }
    // Hyphenated locally, as every declared tool is; the runtime joins the
    // plugin id with an underscore. Two of these were `agent_scan_directories`
    // and `agent_set_trust_level` before the conversion.
    expect(names).toEqual([
      "agents_connect",
      "agents_scan-directories",
      "agents_set-trust-level",
    ]);

    harness.reset();
  });

  it("keeps AI-backed skill derivation enabled by default", () => {
    expect(agentDiscoveryConfigSchema.parse({})).toEqual({
      notifyOnNewAgents: false,
      enableSkillDerivation: true,
    });
  });

  it("accepts explicit notification and skill-derivation posture", () => {
    expect(
      agentDiscoveryConfigSchema.parse({
        notifyOnNewAgents: true,
        enableSkillDerivation: false,
      }),
    ).toEqual({
      notifyOnNewAgents: true,
      enableSkillDerivation: false,
    });
  });
});
