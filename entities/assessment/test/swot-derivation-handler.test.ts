import { beforeEach, describe, expect, it } from "bun:test";
import { resetPromptCache } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { SwotAdapter, SwotAssessmentPlugin } from "../src";
import { AgentAdapter, SkillAdapter } from "./helpers";
import { SwotDerivationHandler } from "../src/handlers/swot-derivation-handler";

const agentAdapter = new AgentAdapter();
const skillAdapter = new SkillAdapter();
const swotAdapter = new SwotAdapter();

describe("SwotDerivationHandler", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    resetPromptCache();
    harness = createPluginHarness({ dataDir: "/tmp/test-swot-handler" });
  });

  it("creates the swot entity from refined AI output", async () => {
    const plugin = new SwotAssessmentPlugin();
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
                  {
                    theme: "research",
                    evidence: "clear owner strength reinforced by the network",
                    action: "lean into it",
                  },
                ],
                weaknesses: [
                  {
                    theme: "analysis",
                    evidence: "owner lacks dependable support",
                    action: "strengthen it before promising it",
                  },
                ],
                opportunities: [
                  {
                    theme: "video",
                    evidence: "tentative network skill",
                    action: "review it before relying on it",
                  },
                ],
                threats: [
                  {
                    theme: "backlog",
                    evidence: "tentative adjacent skill still needs review",
                    action: "do not plan around it yet",
                  },
                ],
              }
            : {
                strengths: [
                  {
                    sourceTheme: "research",
                    title: "Research edge",
                    detail: "Use it confidently.",
                  },
                ],
                weaknesses: [
                  {
                    sourceTheme: "analysis",
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
      entity: {
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
      },
    });

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const entity = await harness.getEntityService().getEntity({
      entityType: "swot",
      id: "swot",
    });
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
    const plugin = new SwotAssessmentPlugin();
    await harness.installPlugin(plugin);

    const shell = harness.getMockShell();
    shell.generateObject = async <T>(
      prompt: string,
      schema: { parse: (value: unknown) => T },
    ): Promise<{ object: T }> => ({
      object: schema.parse(
        prompt.includes("Draft SWOT:")
          ? {
              strengths: [
                {
                  sourceTheme: "research",
                  title: "Research",
                  detail: "ok",
                },
              ],
              weaknesses: [],
              opportunities: [],
              threats: [],
            }
          : {
              strengths: [
                {
                  theme: "research",
                  evidence: "clear owner skill",
                  action: prompt.includes("Grounded directory context:")
                    ? "ok"
                    : "missing",
                },
              ],
              weaknesses: [],
              opportunities: [],
              threats: [],
            },
      ),
    });

    await harness.getEntityService().createEntity({
      entity: {
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
      },
    });

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const derivationPromptEntity = await harness.getEntityService().getEntity({
      entityType: "prompt",
      id: "assessment-swot-derivation",
    });
    const refinementPromptEntity = await harness.getEntityService().getEntity({
      entityType: "prompt",
      id: "assessment-swot-refinement",
    });

    expect(derivationPromptEntity).not.toBeNull();
    expect(derivationPromptEntity?.content).toContain(
      "assessment:swot-derivation",
    );
    expect(refinementPromptEntity).not.toBeNull();
    expect(refinementPromptEntity?.content).toContain(
      "assessment:swot-refinement",
    );
  });

  it("materializes the swot prompt entity and uses prompt overrides", async () => {
    const plugin = new SwotAssessmentPlugin();
    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
        id: "assessment-swot-derivation",
        entityType: "prompt",
        content: `---\ntitle: Assessment Swot Derivation\ntarget: assessment:swot-derivation\n---\nCustom SWOT prompt instructions.`,
        metadata: {
          title: "Assessment Swot Derivation",
          target: "assessment:swot-derivation",
          slug: "assessment-swot-derivation",
        },
      },
    });

    await harness.getEntityService().createEntity({
      entity: {
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
        object: schema.parse(
          receivedPrompts.length === 1
            ? {
                strengths: [
                  {
                    theme: "research",
                    evidence: "clear owner skill",
                    action: "lean into it",
                  },
                ],
                weaknesses: [],
                opportunities: [],
                threats: [],
              }
            : {
                strengths: [
                  {
                    sourceTheme: "research",
                    title: "Research",
                    detail: "Use it confidently.",
                  },
                ],
                weaknesses: [],
                opportunities: [],
                threats: [],
              },
        ),
      };
    };

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    const promptEntity = await harness.getEntityService().getEntity({
      entityType: "prompt",
      id: "assessment-swot-derivation",
    });

    expect(promptEntity).not.toBeNull();
    expect(receivedPrompts[0]).toContain("Custom SWOT prompt instructions.");
    expect(receivedPrompts[0]).toContain("Grounded directory context:");
    expect(receivedPrompts[1]).toContain("Draft SWOT:");
  });

  it("includes evidence cards with candidate matches and external skills in the draft prompt", async () => {
    const plugin = new SwotAssessmentPlugin();
    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
        id: "skill-1",
        entityType: "skill",
        content: skillAdapter.createSkillContent({
          name: "Research",
          description: "Turn source material into grounded findings.",
          tags: ["research", "synthesis"],
          examples: ["Example"],
        }),
        metadata: {
          name: "Research",
          description: "Turn source material into grounded findings.",
          tags: ["research", "synthesis"],
          examples: ["Example"],
        },
      },
    });

    await harness.getEntityService().createEntity({
      entity: {
        id: "agent-1",
        entityType: "agent",
        content: agentAdapter.createAgentContent({
          name: "Signal Forge",
          brainName: "signal-forge",
          url: "https://signal-forge.example.com",
          status: "approved",
          kind: "professional",
          discoveredAt: "2026-04-20T00:00:00.000Z",
          about: "Research partner",
          notes: "Approved and reliable.",
          skills: [
            {
              name: "Research Operations",
              description: "Deep source gathering and synthesis.",
              tags: ["research", "synthesis"],
            },
            {
              name: "Facilitation",
              description: "Turns research into collaborative sessions.",
              tags: ["facilitation", "workshops"],
            },
          ],
        }),
        metadata: {
          name: "Signal Forge",
          url: "https://signal-forge.example.com",
          status: "approved",
          slug: "signal-forge",
        },
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
        object: schema.parse(
          receivedPrompts.length === 1
            ? {
                strengths: [
                  {
                    theme: "research",
                    evidence: "Research is reinforced by Research Operations.",
                    action: "Use it confidently.",
                  },
                ],
                weaknesses: [],
                opportunities: [
                  {
                    theme: "facilitation",
                    evidence:
                      "Facilitation appears as an external network skill.",
                    action: "Test it in live sessions.",
                  },
                ],
                threats: [],
              }
            : {
                strengths: [
                  {
                    sourceTheme: "research",
                    title: "Research",
                    detail: "Use it confidently.",
                  },
                ],
                weaknesses: [],
                opportunities: [
                  {
                    sourceTheme: "facilitation",
                    title: "Facilitation",
                    detail: "Test it in live sessions.",
                  },
                ],
                threats: [],
              },
        ),
      };
    };

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    expect(receivedPrompts[0]).toContain('"candidateMatches"');
    expect(receivedPrompts[0]).toContain('"Research Operations"');
    expect(receivedPrompts[0]).toContain('"externalNetworkSkills"');
    expect(receivedPrompts[0]).toContain('"Facilitation"');
  });

  it("includes exact allowed themes in the refinement prompt", async () => {
    const plugin = new SwotAssessmentPlugin();
    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
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
        object: schema.parse(
          receivedPrompts.length === 1
            ? {
                strengths: [
                  {
                    theme: "research systems",
                    evidence: "clear owner strength",
                    action: "lean into it",
                  },
                ],
                weaknesses: [
                  {
                    theme: "editorial writing",
                    evidence: "thin support",
                    action: "review before shipping",
                  },
                ],
                opportunities: [],
                threats: [],
              }
            : {
                strengths: [
                  {
                    sourceTheme: "research systems",
                    title: "Research systems",
                    detail: "Use it confidently.",
                  },
                ],
                weaknesses: [
                  {
                    sourceTheme: "editorial writing",
                    title: "Editorial writing",
                    detail: "Get review before shipping.",
                  },
                ],
                opportunities: [],
                threats: [],
              },
        ),
      };
    };

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "test" }, "job-1", reporter as never);

    expect(receivedPrompts[1]).toContain("Allowed themes by quadrant:");
    expect(receivedPrompts[1]).toContain('"research systems"');
    expect(receivedPrompts[1]).toContain('"editorial writing"');
  });

  it("updates the existing swot entity instead of creating a duplicate", async () => {
    const plugin = new SwotAssessmentPlugin();
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
        object: schema.parse(
          callCount % 2 === 1
            ? {
                strengths: [
                  {
                    theme: `strength-${cycle}`,
                    evidence: "clear owner strength",
                    action: "keep using it",
                  },
                ],
                weaknesses: [],
                opportunities: [],
                threats: [],
              }
            : {
                strengths: [
                  {
                    sourceTheme: `strength-${cycle}`,
                    title: `Strength ${cycle}`,
                    detail: null,
                  },
                ],
                weaknesses: [],
                opportunities: [],
                threats: [],
              },
        ),
      };
    };

    await harness.getEntityService().createEntity({
      entity: {
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
      },
    });

    const handler = new SwotDerivationHandler(
      harness.getMockShell().getLogger(),
      harness.getEntityContext("swot"),
    );

    const reporter = { report: async (): Promise<void> => {} };
    await handler.process({ reason: "first" }, "job-1", reporter as never);
    await handler.process({ reason: "second" }, "job-2", reporter as never);

    const entities = await harness.getEntityService().listEntities({
      entityType: "swot",
    });
    expect(entities).toHaveLength(1);

    const parsed = swotAdapter.parseSwotContent(entities[0]?.content ?? "");
    expect(parsed.frontmatter.strengths).toEqual([{ title: "Strength 2" }]);
  });
});
