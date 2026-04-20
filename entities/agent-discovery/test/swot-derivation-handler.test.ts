import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SkillAdapter, SwotAdapter, SwotPlugin } from "../src";
import { SwotDerivationHandler } from "../src/handlers/swot-derivation-handler";

const skillAdapter = new SkillAdapter();
const swotAdapter = new SwotAdapter();

describe("SwotDerivationHandler", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-swot-handler" });
  });

  it("creates the swot entity from AI output", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    shell.generateObject = async <T>(): Promise<{ object: T }> => ({
      object: {
        strengths: [{ title: "Research & writing", detail: "4 sources" }],
        weaknesses: [{ title: "Data analysis", detail: "uncovered" }],
        opportunities: [{ title: "Video production", detail: "agent-only" }],
        threats: [{ title: "Pending review", detail: "1 agent" }],
      } as T,
    });

    await harness.getEntityService().createEntity({
      id: "skill-1",
      entityType: "skill",
      content: skillAdapter.createSkillContent({
        name: "Research",
        description: "Research skill",
        tags: ["research"],
        examples: ["Example"],
      }),
      metadata: {
        name: "Research",
        description: "Research skill",
        tags: ["research"],
        examples: ["Example"],
      },
    });

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const entity = await harness.getEntityService().getEntity("swot", "swot");
    expect(entity).not.toBeNull();
    expect(entity?.metadata).toEqual({ derivedAt: expect.any(String) });

    const parsed = swotAdapter.parseSwotContent(entity?.content ?? "");
    expect(parsed.frontmatter.strengths).toEqual([
      { title: "Research & writing", detail: "4 sources" },
    ]);
    expect(parsed.frontmatter.opportunities).toEqual([
      { title: "Video production", detail: "agent-only" },
    ]);
  });

  it("updates the existing swot entity instead of creating a duplicate", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    let callCount = 0;
    shell.generateObject = async <T>(): Promise<{ object: T }> => {
      callCount += 1;
      return {
        object: {
          strengths: [{ title: `Strength ${callCount}`, detail: null }],
          weaknesses: [],
          opportunities: [],
          threats: [],
        } as T,
      };
    };

    await harness.getEntityService().createEntity({
      id: "skill-1",
      entityType: "skill",
      content: skillAdapter.createSkillContent({
        name: "Research",
        description: "Research skill",
        tags: ["research"],
        examples: ["Example"],
      }),
      metadata: {
        name: "Research",
        description: "Research skill",
        tags: ["research"],
        examples: ["Example"],
      },
    });

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "first" }, "job-1", reporter as never);
    await handler.process({ reason: "second" }, "job-2", reporter as never);

    const entities = await harness.getEntityService().listEntities("swot");
    expect(entities).toHaveLength(1);

    const parsed = swotAdapter.parseSwotContent(entities[0]?.content ?? "");
    expect(parsed.frontmatter.strengths).toEqual([{ title: "Strength 2" }]);
  });
});
