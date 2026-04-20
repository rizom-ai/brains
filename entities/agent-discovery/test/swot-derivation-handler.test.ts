import { beforeEach, describe, expect, it } from "bun:test";
import { resetPromptCache } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { SkillAdapter, SwotAdapter, SwotPlugin } from "../src";
import { SwotDerivationHandler } from "../src/handlers/swot-derivation-handler";

const skillAdapter = new SkillAdapter();
const swotAdapter = new SwotAdapter();

describe("SwotDerivationHandler", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    resetPromptCache();
    harness = createPluginHarness({ dataDir: "/tmp/test-swot-handler" });
  });

  it("creates the swot entity from refined AI output", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    let callCount = 0;
    shell.generateObject = async <T>(
      _prompt: string,
      schema: { parse: (value: unknown) => T },
    ): Promise<{ object: T }> => {
      callCount += 1;
      return {
        object: schema.parse(
          callCount === 1
            ? {
                strengths: [
                  { title: "Research & writing", detail: "4 sources" },
                ],
                weaknesses: [{ title: "Data analysis", detail: "uncovered" }],
                opportunities: [
                  { title: "Video production", detail: "agent-only" },
                ],
                threats: [{ title: "Pending review", detail: "1 agent" }],
              }
            : {
                strengths: [
                  { title: "Research edge", detail: "Use it confidently." },
                ],
                weaknesses: [
                  {
                    title: "Analysis gap",
                    detail: "Strengthen it before promising it.",
                  },
                ],
                opportunities: [],
                threats: [],
              },
        ),
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
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const entity = await harness.getEntityService().getEntity("swot", "swot");
    expect(entity).not.toBeNull();
    expect(entity?.metadata).toEqual({ derivedAt: expect.any(String) });

    const parsed = swotAdapter.parseSwotContent(entity?.content ?? "");
    expect(parsed.frontmatter.strengths).toEqual([
      { title: "Research edge", detail: "Use it confidently." },
    ]);
    expect(parsed.frontmatter.weaknesses).toEqual([
      { title: "Analysis gap", detail: "Strengthen it before promising it." },
    ]);
  });

  it("materializes the swot prompt entity when missing", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    shell.generateObject = async <T>(
      prompt: string,
      schema: { parse: (value: unknown) => T },
    ): Promise<{ object: T }> => ({
      object: schema.parse({
        strengths: [
          {
            title: "Research",
            detail: prompt.includes("Grounded directory context:")
              ? "ok"
              : "missing",
          },
        ],
        weaknesses: [],
        opportunities: [],
        threats: [],
      }),
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

    const derivationPromptEntity = await harness
      .getEntityService()
      .getEntity("prompt", "agent-discovery-swot-derivation");
    const refinementPromptEntity = await harness
      .getEntityService()
      .getEntity("prompt", "agent-discovery-swot-refinement");

    expect(derivationPromptEntity).not.toBeNull();
    expect(derivationPromptEntity?.content).toContain(
      "agent-discovery:swot-derivation",
    );
    expect(refinementPromptEntity).not.toBeNull();
    expect(refinementPromptEntity?.content).toContain(
      "agent-discovery:swot-refinement",
    );
  });

  it("materializes the swot prompt entity and uses prompt overrides", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      id: "agent-discovery-swot-derivation",
      entityType: "prompt",
      content: `---\ntitle: Agent Discovery Swot Derivation\ntarget: agent-discovery:swot-derivation\n---\nCustom SWOT prompt instructions.`,
      metadata: {
        title: "Agent Discovery Swot Derivation",
        target: "agent-discovery:swot-derivation",
        slug: "agent-discovery-swot-derivation",
      },
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

    const receivedPrompts: string[] = [];
    const shell = harness.getMockShell();
    shell.generateObject = async <T>(
      prompt: string,
      schema: { parse: (value: unknown) => T },
    ): Promise<{ object: T }> => {
      receivedPrompts.push(prompt);
      return {
        object: schema.parse({
          strengths: [{ title: "Research", detail: "Use it confidently." }],
          weaknesses: [],
          opportunities: [],
          threats: [],
        }),
      };
    };

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const promptEntity = await harness
      .getEntityService()
      .getEntity("prompt", "agent-discovery-swot-derivation");

    expect(promptEntity).not.toBeNull();
    expect(receivedPrompts[0]).toContain("Custom SWOT prompt instructions.");
    expect(receivedPrompts[0]).toContain("Grounded directory context:");
    expect(receivedPrompts[1]).toContain("Draft SWOT:");
  });

  it("updates the existing swot entity instead of creating a duplicate", async () => {
    const plugin = new SwotPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    let callCount = 0;
    shell.generateObject = async <T>(
      _prompt: string,
      schema: { parse: (value: unknown) => T },
    ): Promise<{ object: T }> => {
      callCount += 1;
      const cycle = Math.ceil(callCount / 2);
      return {
        object: schema.parse({
          strengths: [{ title: `Strength ${cycle}`, detail: null }],
          weaknesses: [],
          opportunities: [],
          threats: [],
        }),
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
