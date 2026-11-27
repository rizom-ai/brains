import { describe, expect, test } from "bun:test";
import { agentDiscoveryCompositeConfigSchema } from "../src";

/**
 * The agents capability's config, which the canonical brain reads to pick
 * the skill type with or without its derivation rule and to tell the agent
 * tools whether new agents are announced and whether the network is asked
 * peer by skill or every approved peer. Its plugins are pinned in
 * registration.test.ts.
 */
describe("agent-discovery composite config", () => {
  test("keeps AI-backed skill derivation enabled by default, and asks peers by skill", () => {
    expect(agentDiscoveryCompositeConfigSchema.parse({})).toEqual({
      notifyOnNewAgents: false,
      askAllApproved: false,
      enableSkillDerivation: true,
    });
  });

  test("accepts explicit notification, routing and skill-derivation posture", () => {
    expect(
      agentDiscoveryCompositeConfigSchema.parse({
        notifyOnNewAgents: true,
        askAllApproved: true,
        enableSkillDerivation: false,
      }),
    ).toEqual({
      notifyOnNewAgents: true,
      askAllApproved: true,
      enableSkillDerivation: false,
    });
  });
});
