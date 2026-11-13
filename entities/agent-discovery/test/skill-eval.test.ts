import { describe, expect, it } from "bun:test";
import type { EvalHandler, ProjectionWriteIntent } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { skillPlugins } from "./agent-discovery-plugins";

/**
 * `skill:deriveSkills` measures the production skill-derivation rule: it
 * seeds a case's topics, runs the rule as production runs it (select and
 * derive, nothing written) and answers what the rule would write.
 */
describe("the deriveSkills eval", () => {
  it("seeds the case's topics and answers what the production rule would write", async () => {
    const shell = createMockShell();
    const evals = new Map<string, EvalHandler>();
    shell.registerEvalHandler = (pluginId, handlerId, handler): void => {
      evals.set(`${pluginId}:${handlerId}`, handler);
    };
    const ran: string[] = [];
    const skill = {
      name: "Design distributed systems",
      description: "Design systems that keep agreeing.",
      tags: ["systems"],
      examples: ["How do I design for partitions?"],
    };
    shell.runProjectionRule = async (
      ruleId,
    ): Promise<readonly ProjectionWriteIntent[]> => {
      ran.push(ruleId);
      const topics = await shell
        .getEntityService()
        .listEntities({ entityType: "topic" });
      expect(topics.map(({ id }) => id).sort()).toEqual([
        "event-sourcing",
        "software-architecture",
      ]);
      return [
        {
          operation: "upsert",
          entity: {
            id: "design-distributed-systems",
            entityType: "skill",
            content: "",
            metadata: skill,
            visibility: "public",
          },
        },
      ];
    };
    for (const plugin of skillPlugins()) await plugin.register(shell);
    const derive = evals.get("skill:deriveSkills");
    if (!derive) throw new Error("No deriveSkills eval");

    expect(
      await derive({
        topicTitles: ["Event Sourcing", "Software Architecture"],
      }),
    ).toEqual({ created: 1, updated: 0, deleted: 0, skills: [skill] });
    expect(ran).toEqual(["skill-derivation"]);
    // The run wrote nothing: no skill is stored.
    expect(
      await shell.getEntityService().listEntities({ entityType: "skill" }),
    ).toEqual([]);
  });
});
