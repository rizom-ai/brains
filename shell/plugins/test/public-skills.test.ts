import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import { createBasePluginContext } from "../src/base/context";

const publicTools = [
  {
    name: "system_search",
    description: "Search public knowledge",
    pluginId: "system",
  },
];

describe("public card skills", () => {
  it("falls back to public tools when no valid skill entity exists", async () => {
    const shell = createMockShell();
    shell.listToolsForPermissionLevel = (): typeof publicTools => publicTools;

    const skills = await createBasePluginContext(
      shell,
      "publisher",
    ).publicSkills.list();

    expect(skills).toEqual([
      {
        id: "system_search",
        name: "system_search",
        description: "Search public knowledge",
        tags: [],
        examples: [],
      },
    ]);
  });

  it("uses only valid public skill entities and normalizes their ids", async () => {
    const shell = createMockShell();
    shell.listToolsForPermissionLevel = (): typeof publicTools => publicTools;
    shell.addEntities([
      {
        id: "public-skill",
        entityType: "skill",
        content: "",
        metadata: {
          name: "Knowledge & Search",
          description: "Find useful knowledge",
          tags: ["knowledge"],
          examples: ["Find the plan"],
        },
        visibility: "public",
        contentHash: "public-skill-hash",
        created: "2026-08-18T00:00:00.000Z",
        updated: "2026-08-18T00:00:00.000Z",
      },
      {
        id: "restricted-skill",
        entityType: "skill",
        content: "",
        metadata: {
          name: "Private Skill",
          description: "Must not leak",
          tags: [],
          examples: [],
        },
        visibility: "restricted",
        contentHash: "restricted-skill-hash",
        created: "2026-08-18T00:00:00.000Z",
        updated: "2026-08-18T00:00:00.000Z",
      },
    ]);

    const skills = await createBasePluginContext(
      shell,
      "publisher",
    ).publicSkills.list();

    expect(skills).toEqual([
      {
        id: "knowledge-search",
        name: "Knowledge & Search",
        description: "Find useful knowledge",
        tags: ["knowledge"],
        examples: ["Find the plan"],
      },
    ]);
  });
});
