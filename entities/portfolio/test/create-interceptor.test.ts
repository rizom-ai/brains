import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  CreateCheckResult,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown";
import { portfolioPlugin } from "./portfolio-plugin";

const executionContext = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
};

const caseStudy =
  "# River Atlas\n\nIn 2019 we mapped the river by canoe with the town's school.\n\n## What we learned\n\nSlow is fast.";
const body =
  "In 2019 we mapped the river by canoe with the town's school.\n\n## What we learned\n\nSlow is fast.";

/** A question for the user: no tool names, fields or code. */
function expectUserFacing(question: string): void {
  for (const toolWord of ["fields", "`", "system_create", "Pass "]) {
    expect(question).not.toContain(toolWord);
  }
}

describe("the project create routes", () => {
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
    await harness.installPlugin(portfolioPlugin());
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

  async function check(input: CreateInput): Promise<CreateCheckResult> {
    const createCheck = harness.getEntityRegistry().getCreateCheck("project");
    if (!createCheck) throw new Error("Expected a project create check");
    return createCheck(input, executionContext);
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
    expect(() =>
      harness.getEntityRegistry().getAdapter("project").fromMarkdown(content),
    ).not.toThrow();
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
    const result = await intercept({
      entityType: "project",
      content: "# River Atlas\n\nWe mapped the river by canoe.",
    });
    expect(refusal(result)).toContain("year");
  });

  it("fills in the title, year and description before the save is confirmed", async () => {
    expect(await check({ entityType: "project", content: caseStudy })).toEqual({
      kind: "ready",
      title: "River Atlas",
      fields: {
        year: 2019,
        description: "A river mapped by canoe with a school.",
      },
    });
  });

  it("asks the user for the year before the save is confirmed", async () => {
    derived = { description: "A river mapped by canoe.", year: null };
    const result = await check({
      entityType: "project",
      content: "# River Atlas\n\nWe mapped the river by canoe.",
    });
    expect(result).toMatchObject({
      kind: "question",
      asks: "fields",
      question: "Which year did this project begin?",
    });
    if (result.kind !== "question") throw new Error("Expected a question");
    expectUserFacing(result.question);
    expect(result.answerWith).toContain("fields { year }");
  });

  it("saves what the check filled in without asking the model again", async () => {
    const checked = await check({ entityType: "project", content: caseStudy });
    if (checked.kind !== "ready") throw new Error("Expected a ready check");
    const result = saved(
      await intercept({
        entityType: "project",
        content: caseStudy,
        ...(checked.title && { title: checked.title }),
        ...(checked.fields && { fields: checked.fields }),
      }),
    );
    expect(result.body).toBe(body);
    expect(prompts).toHaveLength(1);
  });

  it("leaves a complete project document to the confirmation as it is", async () => {
    expect(
      await check({
        entityType: "project",
        content:
          "---\ntitle: Done\nstatus: draft\ndescription: Ready.\nyear: 2020\n---\n\nBody",
      }),
    ).toEqual({ kind: "ready" });
    expect(prompts).toEqual([]);
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
