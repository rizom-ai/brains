import { describe, it, expect, beforeEach } from "bun:test";
import type { ContentVisibility } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { A2AInterface } from "../src/a2a-interface";

interface SkillFixture {
  id: string;
  visibility: ContentVisibility;
  metadata: {
    name: string;
    description: string;
    tags: string[];
    examples: string[];
  };
}

describe("agent card excludes non-public skills", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-visibility"),
    });
  });

  it("includes only public skill entities when building the public agent card", async () => {
    const entityService = harness.getMockShell().getEntityService();

    const skills: SkillFixture[] = [
      {
        id: "public-skill",
        visibility: "public",
        metadata: {
          name: "Public Skill",
          description: "Public capability",
          tags: ["public"],
          examples: ["Show me public stuff"],
        },
      },
      {
        id: "shared-skill",
        visibility: "shared",
        metadata: {
          name: "Shared Skill",
          description: "Shared capability",
          tags: ["shared"],
          examples: ["Show me shared stuff"],
        },
      },
      {
        id: "restricted-skill",
        visibility: "restricted",
        metadata: {
          name: "Restricted Skill",
          description: "Restricted capability",
          tags: ["restricted"],
          examples: ["Show me restricted stuff"],
        },
      },
    ];

    for (const skill of skills) {
      await entityService.createEntity({
        entity: {
          id: skill.id,
          entityType: "skill",
          content: "",
          visibility: skill.visibility,
          metadata: skill.metadata,
        },
      });
    }

    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    await plugin.ready();

    const card = plugin.getAgentCard();
    const cardSkillNames = (card?.skills ?? []).map((skill) => skill.name);
    expect(cardSkillNames).toContain("Public Skill");
    expect(cardSkillNames).not.toContain("Shared Skill");
    expect(cardSkillNames).not.toContain("Restricted Skill");
  });
});
