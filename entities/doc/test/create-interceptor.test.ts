import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  BaseEntity,
  CreateCheckResult,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown";
import { docsPlugin } from "./docs-plugin";

// The adapter the docs register for their type.
const docAdapter = docsPlugin().adapter;

const executionContext: CreateExecutionContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
  userPermissionLevel: "admin",
};

const trustedContext: CreateExecutionContext = {
  ...executionContext,
  userPermissionLevel: "trusted",
};

const guide =
  "# Rotating keys\n\nKeys rotate every 90 days.\n\n## Steps\n\n1. Revoke.\n2. Reissue.";
const body =
  "Keys rotate every 90 days.\n\n## Steps\n\n1. Revoke.\n2. Reissue.";

/** A question for the user: no tool names, fields or code. */
function expectUserFacing(question: string): void {
  for (const toolWord of ["fields", "`", "system_create", "Pass "]) {
    expect(question).not.toContain(toolWord);
  }
}

function existingDoc(
  id: string,
  section: string,
  order: number,
  visibility: BaseEntity["visibility"] = "public",
): BaseEntity {
  return {
    id,
    entityType: "doc",
    content: `---\ntitle: ${id}\nsection: ${section}\norder: ${order}\n---\n\nText`,
    contentHash: `hash-${id}`,
    visibility,
    metadata: { title: id, section, order, slug: id, description: null },
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

describe("doc create route", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: "/tmp/test-datadir-docs-create",
      logContext: "docs-create-test",
    });
    await harness.installPlugin(docsPlugin());
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function intercept(
    input: CreateInput,
    caller = executionContext,
  ): Promise<CreateInterceptionResult> {
    const interceptor = harness.getEntityRegistry().getCreateInterceptor("doc");
    if (!interceptor) throw new Error("Expected a doc create interceptor");
    return interceptor(input, caller);
  }

  async function check(
    input: CreateInput,
    caller = executionContext,
  ): Promise<CreateCheckResult> {
    const createCheck = harness.getEntityRegistry().getCreateCheck("doc");
    if (!createCheck) throw new Error("Expected a doc create check");
    return createCheck(input, caller);
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
    expect(() => docAdapter.fromMarkdown(content)).not.toThrow();
    const { frontmatter, content: savedBody } = parseMarkdown(content);
    return { title: result.input.title, frontmatter, body: savedBody };
  }

  function refusal(result: CreateInterceptionResult): string {
    if (result.kind !== "handled" || result.result.success) {
      throw new Error(`Expected a refusal: ${JSON.stringify(result)}`);
    }
    return result.result.error;
  }

  it("files the page in the docs' only section, after the last page", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Handbook", 10),
        existingDoc("setup", "Handbook", 20),
      ]);

    expect(
      saved(await intercept({ entityType: "doc", content: guide })),
    ).toEqual({
      title: "Rotating keys",
      frontmatter: { title: "Rotating keys", section: "Handbook", order: 21 },
      body,
    });
  });

  it("asks which section when the docs have several", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Start here", 1),
        existingDoc("api", "Reference", 2),
      ]);

    const result = await intercept({ entityType: "doc", content: guide });
    const error = refusal(result);
    expect(error).toContain("section");
    expect(error).toContain("Start here");
    expect(error).toContain("Reference");
  });

  it("offers a trusted writer only the sections of docs they can see", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Start here", 1),
        existingDoc("api", "Reference", 2),
        existingDoc("minutes", "Board minutes", 3, "restricted"),
      ]);

    const result = await check(
      { entityType: "doc", content: guide },
      trustedContext,
    );
    if (result.kind !== "question") throw new Error("Expected a question");
    expect(result.question).toContain('"Start here"');
    expect(result.question).toContain('"Reference"');
    expect(result.question).not.toContain("Board minutes");
  });

  it("still places a trusted writer's page after every doc, restricted ones too", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Handbook", 10),
        existingDoc("minutes", "Board minutes", 30, "restricted"),
      ]);

    const result = await intercept(
      { entityType: "doc", content: guide },
      trustedContext,
    );
    expect(saved(result).frontmatter).toEqual({
      title: "Rotating keys",
      section: "Handbook",
      order: 31,
    });
  });

  it("asks the user which section before the save is confirmed", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Start here", 1),
        existingDoc("api", "Reference", 2),
      ]);

    const result = await check({ entityType: "doc", content: guide });
    expect(result).toMatchObject({ kind: "question", asks: "fields" });
    if (result.kind !== "question") throw new Error("Expected a question");
    expectUserFacing(result.question);
    expect(result.question).toContain('"Start here"');
    expect(result.question).toContain('"Reference"');
    expect(result.answerWith).toContain("fields { section }");
  });

  it("fills in the title and the only section before the save is confirmed", async () => {
    harness.getMockShell().addEntities([existingDoc("intro", "Handbook", 10)]);

    expect(await check({ entityType: "doc", content: guide })).toEqual({
      kind: "ready",
      title: "Rotating keys",
      fields: { section: "Handbook" },
    });
  });

  it("asks which section when there are no docs yet", async () => {
    const error = refusal(
      await intercept({ entityType: "doc", content: guide }),
    );
    expect(error).toContain("section");
  });

  it("uses the section and order the user states", async () => {
    harness
      .getMockShell()
      .addEntities([
        existingDoc("intro", "Start here", 1),
        existingDoc("api", "Reference", 2),
      ]);

    expect(
      saved(
        await intercept({
          entityType: "doc",
          content: guide,
          fields: { section: "Operations" },
        }),
      ).frontmatter,
    ).toEqual({ title: "Rotating keys", section: "Operations", order: 3 });
    expect(
      saved(
        await intercept({
          entityType: "doc",
          content: guide,
          fields: { section: "Operations", order: "7" },
        }),
      ).frontmatter,
    ).toEqual({ title: "Rotating keys", section: "Operations", order: 7 });
  });

  it("asks for a title when the text has none", async () => {
    const error = refusal(
      await intercept({
        entityType: "doc",
        content: "Keys rotate.",
        fields: { section: "Ops" },
      }),
    );
    expect(error).toContain("title");
  });

  it("leaves a complete doc to the direct create", async () => {
    const input: CreateInput = {
      entityType: "doc",
      content: "---\ntitle: Done\nsection: Ops\norder: 1\n---\n\nBody",
    };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
  });
});
