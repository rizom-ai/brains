import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AgentAdapter,
  SkillAdapter,
  agentEntitySchema,
  skillEntitySchema,
} from "@brains/agent-discovery";
import { SwotEvalPlugin, swotEvalPlugin } from "@brains/assessment/eval";
import type { EvalHandler } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import * as production from "../src";

const testCaseSchema = z.object({
  plugin: z.string(),
  handler: z.string(),
  input: z.looseObject({
    skills: z.array(z.looseObject({ name: z.string() })),
    agents: z.array(z.looseObject({ name: z.string(), url: z.string() })),
  }),
});

const basicTestCase = testCaseSchema.parse(
  fromYaml(
    readFileSync(
      join(
        import.meta.dir,
        "..",
        "evals",
        "test-cases",
        "swot-derive-basic.yaml",
      ),
      "utf-8",
    ),
  ),
);

function hasParser<T>(schema: unknown): schema is { parse(value: unknown): T } {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    typeof schema.parse === "function"
  );
}

function parseGenerated<T>(schema: unknown, value: unknown): T {
  if (!hasParser<T>(schema)) {
    throw new Error("Test generation schema does not provide parsing");
  }
  return schema.parse(value);
}

const draft = {
  strengths: [{ theme: "research", evidence: "owner", action: "lean in" }],
  weaknesses: [{ theme: "analysis", evidence: "thin", action: "strengthen" }],
  opportunities: [],
  threats: [],
};
const refined = {
  strengths: [
    { sourceTheme: "research", title: "Research edge", detail: "Use it." },
  ],
  weaknesses: [
    { sourceTheme: "analysis", title: "Analysis gap", detail: "Build it." },
  ],
  opportunities: [],
  threats: [],
};

describe("SwotEvalPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let evalHandlers: Map<string, EvalHandler>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-swot-eval-${randomUUID()}`,
    });
    const shell = harness.getMockShell();
    shell.getProfileKindRegistry().finalize();
    evalHandlers = new Map();
    shell.registerEvalHandler = (pluginId, handlerId, handler): void => {
      evalHandlers.set(`${pluginId}:${handlerId}`, handler);
    };
    let generations = 0;
    shell.generateObject = async <T>(
      _prompt: string,
      schema: unknown,
    ): Promise<{ object: T }> => {
      generations += 1;
      return {
        object: parseGenerated(schema, generations === 1 ? draft : refined),
      };
    };
  });

  it("is served from the eval entry, not the production one", () => {
    expect(swotEvalPlugin()).toBeInstanceOf(SwotEvalPlugin);
    expect(Object.values(production)).not.toContain(SwotEvalPlugin);
    expect(Object.values(production)).not.toContain(swotEvalPlugin);
  });

  it("registers agent-discovery's agent and skill types beside SWOT", async () => {
    await harness.installPlugin(swotEvalPlugin());

    const registry = harness.getEntityRegistry();
    expect(registry.getAdapter("agent")).toBeInstanceOf(AgentAdapter);
    expect(registry.getAdapter("agent").schema).toBe(agentEntitySchema);
    expect(registry.getAdapter("skill")).toBeInstanceOf(SkillAdapter);
    expect(registry.getAdapter("skill").schema).toBe(skillEntitySchema);
    expect(harness.getEntityService().getEntityTypes()).toContain("swot");
  });

  it("registers the handler its test cases address", async () => {
    await harness.installPlugin(swotEvalPlugin());

    expect([...evalHandlers.keys()]).toEqual([
      `${basicTestCase.plugin}:${basicTestCase.handler}`,
    ]);
  });

  it("seeds a test case's directory as agents and skills agent-discovery reads", async () => {
    await harness.installPlugin(swotEvalPlugin());
    const handler = evalHandlers.get(
      `${basicTestCase.plugin}:${basicTestCase.handler}`,
    );
    if (!handler) throw new Error("Expected the deriveSwot eval handler");

    const swot = await handler(basicTestCase.input);

    expect(swot).toMatchObject({
      strengths: [{ title: "Research edge", detail: "Use it." }],
    });
    const entityService = harness.getEntityService();
    const agents = await entityService.listEntities(
      { entityType: "agent" },
      agentEntitySchema,
    );
    const agentAdapter = new AgentAdapter();
    expect(
      agents.map((agent) => agentAdapter.parseEntity(agent).frontmatter.url),
    ).toEqual(
      expect.arrayContaining(basicTestCase.input.agents.map(({ url }) => url)),
    );
    expect(agents).toHaveLength(basicTestCase.input.agents.length);
    const skills = await entityService.listEntities(
      { entityType: "skill" },
      skillEntitySchema,
    );
    expect(skills.map((skill) => skill.metadata.name).sort()).toEqual(
      basicTestCase.input.skills.map(({ name }) => name).sort(),
    );
  });
});
