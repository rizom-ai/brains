import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { buildCapabilityProfilesFromEntities } from "../src/lib/capability-profile";

function handWrittenAgent(body: string): BaseEntity {
  return {
    id: "field-lab.io",
    entityType: "agent",
    content: `---
name: Field Lab
kind: team
brainName: Field Lab Brain
url: https://field-lab.io
status: approved
---

${body}`,
    metadata: { name: "Field Lab", status: "approved", slug: "field-lab-io" },
    contentHash: "hash-field-lab",
    visibility: "public",
    created: "2026-09-27T00:00:00.000Z",
    updated: "2026-09-27T00:00:00.000Z",
  };
}

describe("buildCapabilityProfilesFromEntities", () => {
  it("keeps an agent's about and skill tags when its file has no Notes section", () => {
    const { networkProfiles } = buildCapabilityProfilesFromEntities({
      agents: [
        handWrittenAgent(
          "## About\n\nField researchers.\n\n## Skills\n\n- Field Notes: Keep field notes [Field Research, writing]",
        ),
      ],
      skills: [],
    });

    expect(networkProfiles).toEqual([
      expect.objectContaining({
        id: "field-lab.io",
        description: "Field researchers.",
        skills: [
          {
            name: "Field Notes",
            description: "Keep field notes",
            tags: ["field-research", "writing"],
          },
        ],
      }),
    ]);
  });
});
