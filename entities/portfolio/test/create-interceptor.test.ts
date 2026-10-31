import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { CreateInput, CreateInterceptionResult } from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown";
import { PortfolioPlugin } from "../src/plugin";
import { projectAdapter } from "../src/adapters/project-adapter";

const executionContext = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
};

const caseStudy =
  "# River Atlas\n\nIn 2019 we mapped the river by canoe with the town's school.\n\n## What we learned\n\nSlow is fast.";
const body =
  "In 2019 we mapped the river by canoe with the town's school.\n\n## What we learned\n\nSlow is fast.";

describe("PortfolioPlugin create interceptor", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let prompts: Array<{ templateName: string; prompt: string | undefined }>;
  let derived: { description: string; year: number | null };

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: "/tmp/test-datadir-portfolio-create",
      logContext: "portfolio-create-test",
    });
    prompts = [];
    derived = {
      description: "A river mapped by canoe with a school.",
      year: 2019,
    };
    harness.getMockShell().generateContent = async (
      config,
    ): Promise<unknown> => {
      prompts.push({
        templateName: config.templateName,
        prompt: config.prompt,
      });
      return derived;
    };
    await harness.installPlugin(new PortfolioPlugin({}));
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function intercept(
    input: CreateInput,
  ): Promise<CreateInterceptionResult> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("project");
    if (!interceptor) throw new Error("Expected a project create interceptor");
    return interceptor(input, executionContext);
  }

  function saved(result: CreateInterceptionResult): {
    title: string | undefined;
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    if (result.kind !== "continue") {
      throw new Error(
        `Expected the create to continue: ${JSON.stringify(result)}`,
      );
    }
    const content = result.input.content ?? "";
    // The direct create stores exactly this document through the adapter.
    expect(() => projectAdapter.fromMarkdown(content)).not.toThrow();
    const { frontmatter, content: savedBody } = parseMarkdown(content);
    return { title: result.input.title, frontmatter, body: savedBody };
  }

  function refusal(result: CreateInterceptionResult): string {
    if (result.kind !== "handled" || result.result.success) {
      throw new Error(`Expected a refusal: ${JSON.stringify(result)}`);
    }
    return result.result.error;
  }

  it("keeps the case study as written and derives its card description and year", async () => {
    expect(
      saved(await intercept({ entityType: "project", content: caseStudy })),
    ).toEqual({
      title: "River Atlas",
      frontmatter: {
        title: "River Atlas",
        status: "draft",
        description: "A river mapped by canoe with a school.",
        year: 2019,
      },
      body,
    });
    expect(prompts).toEqual([
      {
        templateName: "portfolio:from-text",
        prompt: expect.stringContaining("Slow is fast."),
      },
    ]);
  });

  it("asks for the year when the text does not say when the project began", async () => {
    derived = { description: "A river mapped by canoe.", year: null };
    const error = refusal(
      await intercept({
        entityType: "project",
        content: "# River Atlas\n\nWe mapped the river by canoe.",
      }),
    );
    expect(error).toContain("year");
  });

  it("does not take a year the text never mentions", async () => {
    derived = { description: "A river mapped by canoe.", year: 2021 };
    const error = refusal(
      await intercept({
        entityType: "project",
        content: "# River Atlas\n\nWe mapped the river by canoe.",
      }),
    );
    expect(error).toContain("year");
  });

  it("uses the year and description the user states without asking the model", async () => {
    const result = saved(
      await intercept({
        entityType: "project",
        content: caseStudy,
        fields: { year: "2018", description: "My own summary." },
      }),
    );
    expect(result.frontmatter).toEqual({
      title: "River Atlas",
      status: "draft",
      description: "My own summary.",
      year: 2018,
    });
    expect(prompts).toEqual([]);
  });

  it("asks for a title when the text has none", async () => {
    const error = refusal(
      await intercept({ entityType: "project", content: "We mapped a river." }),
    );
    expect(error).toContain("title");
  });

  it("refuses fields a project does not have", async () => {
    const error = refusal(
      await intercept({
        entityType: "project",
        content: caseStudy,
        fields: { client: "Town" },
      }),
    );
    expect(error).toContain("client");
  });

  it("leaves a complete project document to the direct create", async () => {
    const input: CreateInput = {
      entityType: "project",
      content:
        "---\ntitle: Done\nstatus: draft\ndescription: Ready.\nyear: 2020\n---\n\nBody",
    };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
    expect(prompts).toEqual([]);
  });
});
