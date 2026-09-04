import { createMockShell } from "../src/test/mock-shell";
import { describe, expect, it } from "bun:test";

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

  it("falls back to public tools when skill storage is unavailable", async () => {
    const shell = createMockShell();
    shell.listToolsForPermissionLevel = (): typeof publicTools => publicTools;
    const entityService = shell.getEntityService();
    entityService.hasEntityType = (): boolean => true;
    entityService.listEntities = (): never => {
      throw new Error("skill storage unavailable");
    };

    const skills = await createBasePluginContext(
      shell,
      "publisher",
    ).publicSkills.list();

    expect(skills.map((skill) => skill.id)).toEqual(["system_search"]);
  });

  it("does not disguise a fault in skill mapping as missing skill storage", async () => {
    const shell = createMockShell();
    shell.listToolsForPermissionLevel = (): typeof publicTools => publicTools;
    // Storage answers; the fault happens afterwards, while we shape the rows.
    // That is our bug, not an outage, and must not surface as "no skills".
    shell.addEntities([
      {
        id: "hostile-skill",
        entityType: "skill",
        content: "",
        // Reading this is what our mapping does first; make that the fault.
        get metadata(): Record<string, unknown> {
          throw new TypeError("metadata unreadable");
        },
        visibility: "public",
        contentHash: "hostile-hash",
        created: "2026-08-18T00:00:00.000Z",
        updated: "2026-08-18T00:00:00.000Z",
      },
    ]);

    const outcome = await createBasePluginContext(shell, "publisher")
      .publicSkills.list()
      .then(
        () => "silently degraded to tools",
        (error: unknown) =>
          error instanceof TypeError ? "propagated" : "wrong-error",
      );

    expect(outcome).toBe("propagated");
  });
});
