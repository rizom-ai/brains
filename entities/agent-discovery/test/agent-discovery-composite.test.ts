import { describe, expect, test } from "bun:test";
import { agentDiscoveryCompositeConfigSchema } from "../src";

/**
 * The agents capability's config, which the canonical brain reads to pick
 * the skill type with or without its derivation rule and to tell the agent
 * tools whether new agents are announced. Its plugins are pinned in
 * registration.test.ts.
 */
describe("agent-discovery composite config", () => {
  test("keeps AI-backed skill derivation enabled by default", () => {
    expect(agentDiscoveryCompositeConfigSchema.parse({})).toEqual({
      notifyOnNewAgents: false,
      enableSkillDerivation: true,
    });
  });

  test("accepts explicit notification and skill-derivation posture", () => {
    expect(
      agentDiscoveryCompositeConfigSchema.parse({
        notifyOnNewAgents: true,
        enableSkillDerivation: false,
      }),
    ).toEqual({
      notifyOnNewAgents: true,
      enableSkillDerivation: false,
    });
  });
});
