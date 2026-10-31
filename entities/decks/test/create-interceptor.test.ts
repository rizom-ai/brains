import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { CreateInput, CreateInterceptionResult } from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown";
import { DecksPlugin } from "../src/plugin";
import { deckAdapter } from "../src/adapters/deck-adapter";

const executionContext = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
};

const talk =
  "# Slow software\n\nWhy we ship less.\n\n## The cost of speed\n\nEvery release has a tail.\n\n## What we do instead\n\nWe wait a week.";
const talkAsSlides =
  "# Slow software\n\nWhy we ship less.\n\n---\n\n## The cost of speed\n\nEvery release has a tail.\n\n---\n\n## What we do instead\n\nWe wait a week.";

describe("DecksPlugin create interceptor", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let prompts: Array<{ templateName: string; prompt: string | undefined }>;
  let failDescription: boolean;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: "/tmp/test-datadir-decks-create",
      logContext: "decks-create-test",
    });
    prompts = [];
    failDescription = false;
    const mockShell = harness.getMockShell();
    mockShell.generateContent = async (config): Promise<unknown> => {
      prompts.push({
        templateName: config.templateName,
        prompt: config.prompt,
      });
      if (failDescription) throw new Error("model unavailable");
      return { description: "Why shipping less makes better software." };
    };
    await harness.installPlugin(new DecksPlugin());
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function intercept(
    input: CreateInput,
  ): Promise<CreateInterceptionResult> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("deck");
    if (!interceptor) throw new Error("Expected a deck create interceptor");
    return interceptor(input, executionContext);
  }

  function continued(result: CreateInterceptionResult): CreateInput {
    if (result.kind !== "continue") {
      throw new Error(
        `Expected the create to continue: ${JSON.stringify(result)}`,
      );
    }
    return result.input;
  }

  function saved(result: CreateInterceptionResult): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const content = continued(result).content ?? "";
    // The direct create stores exactly this document through the adapter.
    expect(() => deckAdapter.fromMarkdown(content)).not.toThrow();
    const { frontmatter, content: body } = parseMarkdown(content);
    return { frontmatter, body };
  }

  it("splits pasted text on its headings, titles it from the first, and keeps it as a draft", async () => {
    const result = await intercept({ entityType: "deck", content: talk });

    expect(continued(result).title).toBe("Slow software");
    expect(saved(result)).toEqual({
      frontmatter: {
        title: "Slow software",
        status: "draft",
        description: "Why shipping less makes better software.",
      },
      body: talkAsSlides,
    });
    expect(prompts).toEqual([
      {
        templateName: "decks:description",
        prompt: expect.stringContaining("Every release has a tail."),
      },
    ]);
  });

  it("keeps slides the text already separates exactly as written", async () => {
    const result = await intercept({
      entityType: "deck",
      content: talkAsSlides,
    });
    expect(saved(result).body).toBe(talkAsSlides);
  });

  it("does not split on headings inside code", async () => {
    const withCode =
      "# Shell tips\n\nRun this:\n\n```sh\n# not a slide\nls\n```\n\n## Next\n\nDone.";
    const { body } = saved(
      await intercept({ entityType: "deck", content: withCode }),
    );
    expect(body).toBe(
      "# Shell tips\n\nRun this:\n\n```sh\n# not a slide\nls\n```\n\n---\n\n## Next\n\nDone.",
    );
  });

  it("asks where the slides break when the text has no separators or headings", async () => {
    const result = await intercept({
      entityType: "deck",
      title: "Notes",
      content: "One paragraph.\n\nAnother paragraph.",
    });
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false, question: "slide-breaks" },
    });
    expect(JSON.stringify(result)).toContain("---");
  });

  it("makes each paragraph a slide when the user says so", async () => {
    const notes =
      "# Notes\n\nOne paragraph.\n\nAnother paragraph,\nover two lines.\n\n```\ncode\n\nstays\n```";
    const { body } = saved(
      await intercept({
        entityType: "deck",
        content: notes,
        fields: { slides: "paragraphs" },
      }),
    );
    expect(body).toBe(
      "# Notes\n\n---\n\nOne paragraph.\n\n---\n\nAnother paragraph,\nover two lines.\n\n---\n\n```\ncode\n\nstays\n```",
    );
  });

  it("does not write the slide choice into the deck", async () => {
    const { frontmatter } = saved(
      await intercept({
        entityType: "deck",
        content: talk,
        fields: { slides: "paragraphs" },
      }),
    );
    expect(frontmatter["slides"]).toBeUndefined();
  });

  it("asks for a title when the text has none", async () => {
    const result = await intercept({
      entityType: "deck",
      content: "Intro\n\n---\n\nMore",
    });
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
    expect(JSON.stringify(result)).toContain("title");
  });

  it("uses the stated description and event without asking the model", async () => {
    const result = await intercept({
      entityType: "deck",
      content: talk,
      fields: { description: "My own summary.", event: "DevConf 2026" },
    });
    expect(saved(result).frontmatter).toEqual({
      title: "Slow software",
      status: "draft",
      description: "My own summary.",
      event: "DevConf 2026",
    });
    expect(prompts).toEqual([]);
  });

  it("dates a deck the user says is already published", async () => {
    const { frontmatter } = saved(
      await intercept({
        entityType: "deck",
        content: talk,
        fields: { status: "published", publishedAt: "2025-05-01" },
      }),
    );
    expect(frontmatter).toMatchObject({
      status: "published",
      publishedAt: "2025-05-01T00:00:00.000Z",
    });
  });

  it("saves the deck without a description when the model cannot write one", async () => {
    failDescription = true;
    const { frontmatter } = saved(
      await intercept({ entityType: "deck", content: talk }),
    );
    expect(frontmatter).toEqual({ title: "Slow software", status: "draft" });
  });

  it("refuses fields a deck does not have", async () => {
    const result = await intercept({
      entityType: "deck",
      content: talk,
      fields: { mood: "calm" },
    });
    expect(JSON.stringify(result)).toContain("mood");
  });

  it("keeps the requested visibility", async () => {
    const input = continued(
      await intercept({
        entityType: "deck",
        content: talk,
        visibility: "shared",
      }),
    );
    expect(input.visibility).toBe("shared");
  });

  it("leaves a complete deck document to the direct create", async () => {
    const input: CreateInput = {
      entityType: "deck",
      content: `---\ntitle: Done\nstatus: draft\n---\n\n${talkAsSlides}`,
    };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
    expect(prompts).toEqual([]);
  });

  it("leaves prompt generation alone", async () => {
    const input: CreateInput = { entityType: "deck", prompt: "A talk on X" };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
  });
});
