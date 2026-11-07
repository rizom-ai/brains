import { describe, expect, it } from "bun:test";
import type { EntityTypeConfig, ProjectionSourceRole } from "@brains/plugins";
import { topicsPluginConfigSchema } from "../../src/schemas/config";
import {
  topicBatchSourcePolicy,
  topicSourcePolicy,
} from "../../src/lib/topic-source-policy";

const roles: ProjectionSourceRole[] = [
  "canonical",
  "primary",
  "secondary",
  "supporting",
  "ambient",
  "excluded",
];

const entityTypeConfigs: Record<string, EntityTypeConfig> = {
  ...Object.fromEntries(
    roles.map((role) => [role, { projectionSourceRole: role }]),
  ),
  unroled: {},
  "not-a-source": { projectionSource: false },
};

function entityTypeConfig(entityType: string): EntityTypeConfig {
  return entityTypeConfigs[entityType] ?? {};
}

const config = topicsPluginConfigSchema.parse({
  sourceRolePolicies: {
    secondary: { weight: 0.9, canMint: false },
    supporting: { weight: 0.3, canMint: true },
  },
  sourceRoleOverrides: { unroled: "ambient" },
});

describe("topicBatchSourcePolicy", () => {
  it("gives a one-type batch exactly that type's source policy", () => {
    for (const entityType of Object.keys(entityTypeConfigs)) {
      expect(
        topicBatchSourcePolicy([entityType], config, entityTypeConfig),
      ).toEqual(
        topicSourcePolicy(entityType, config, entityTypeConfig(entityType)),
      );
    }
  });

  it("takes the strongest weight and any mint authority across the batch", () => {
    expect(
      topicBatchSourcePolicy(
        ["supporting", "secondary"],
        config,
        entityTypeConfig,
      ),
    ).toEqual({ weight: 0.9, canMint: true });
    expect(
      topicBatchSourcePolicy(
        ["unroled", "excluded", "not-a-source"],
        config,
        entityTypeConfig,
      ),
    ).toEqual({ weight: 0.35, canMint: false });
  });

  it("gives an empty batch no weight and no mint authority", () => {
    expect(topicBatchSourcePolicy([], config, entityTypeConfig)).toEqual({
      weight: 0,
      canMint: false,
    });
  });
});
