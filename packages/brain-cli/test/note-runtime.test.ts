import { afterEach, describe, expect, test } from "bun:test";
import { noteCaptureContract } from "@brains/contracts";
import notePackage from "@brains/note";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared notes on the brain's own entity store: every note stored as
 * the note adapter wrote it, byte for byte — a plain note plain, a stated
 * title kept stated — whether imported, updated, generated, stubbed or
 * captured for another package.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

let reply: unknown;

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    notePackage,
    "@brains/note",
    "note",
    {
      projectionSourceRole: "primary",
      markdownImport: true,
    },
  );
  opened.shell.generateContent = async (): Promise<unknown> => reply;
  stores.push(opened);
  return opened;
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<{ content: string; metadata: unknown } | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "note", id, markdown },
  });
  const row = await opened.stored("note", id);
  return row
    ? { content: row.content, metadata: JSON.parse(row.metadata) }
    : undefined;
}

async function generate(
  opened: DeclaredEntityStore,
  data: unknown,
): Promise<unknown> {
  const handler = opened.shell
    .getJobQueueService()
    .getHandler("note:generation");
  if (!handler) throw new Error("No note generation");
  return handler.process(
    handler.validateAndParse(data),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

describe("the declared notes on the entity store", () => {
  // Each expected document is what NoteAdapter.toMarkdown stored for it.
  test.each([
    [
      "a plain note",
      "# Simple Note\n\nJust content, no frontmatter.",
      "# Simple Note\n\nJust content, no frontmatter.",
      { title: "Simple Note" },
    ],
    [
      "a stated title",
      "---\ntitle: My Note\n---\nContent here",
      "---\ntitle: My Note\n---\nContent here\n",
      { title: "My Note", titleStated: true },
    ],
    [
      "a stated title its heading repeats",
      "---\ntitle: Same\n---\n\n# Same\n\nBody",
      "---\ntitle: Same\n---\n# Same\n\nBody\n",
      { title: "Same", titleStated: true },
    ],
    [
      "frontmatter the note does not write",
      "---\nsomeOtherField: value\n---\n\n# Heading Title\n\nContent",
      "---\nsomeOtherField: value\n---\n# Heading Title\n\nContent\n",
      { title: "Heading Title" },
    ],
    [
      "a failed generation",
      "---\nstatus: failed\nerror: Generation failed\n---\nBody",
      "---\nstatus: failed\nerror: Generation failed\n---\nBody\n",
      { title: "Body", status: "failed", error: "Generation failed" },
    ],
    [
      "a first line",
      "Just a line\nSecond line",
      "Just a line\nSecond line",
      { title: "Just a line" },
    ],
    [
      "a stated Untitled",
      "---\ntitle: Untitled\n---\nAuthored body",
      "---\ntitle: Untitled\n---\nAuthored body\n",
      { title: "Untitled", titleStated: true },
    ],
  ])(
    "stores %s as the note adapter wrote it",
    async (_, markdown, content, metadata) => {
      const opened = await store();
      expect(await imported(opened, "note-1", markdown)).toEqual({
        content,
        metadata,
      });
    },
  );

  test.each([
    [
      "# Simple Note\n\nJust content, no frontmatter.",
      "# Simple Note\n\nJust Changed, no frontmatter.",
    ],
    [
      "---\ntitle: My Note\n---\nContent here",
      "---\ntitle: My Note\n---\nChanged here\n",
    ],
    [
      "---\nsomeOtherField: value\n---\n\n# Heading Title\n\nContent",
      "---\nsomeOtherField: value\n---\n# Heading Title\n\nChanged\n",
    ],
  ])(
    "keeps a note's form through an update of its body: %s",
    async (markdown, updated) => {
      const opened = await store();
      await imported(opened, "note-1", markdown);
      const read = await opened.service.getEntity({
        entityType: "note",
        id: "note-1",
      });
      if (!read) throw new Error("Missing note");
      await opened.service.updateEntity({
        entity: {
          ...read,
          content: read.content.replace(/(Content|content)/, "Changed"),
        },
      });
      expect((await opened.stored("note", "note-1"))?.content).toBe(updated);
    },
  );
});

describe("the declared note generation on the entity store", () => {
  test("writes a generated body plain, its title in metadata", async () => {
    const opened = await store();
    reply = { title: "Gen Title", body: "Generated body text." };
    expect(await generate(opened, { prompt: "About tides" })).toEqual({
      success: true,
      entityId: "gen-title",
      title: "Gen Title",
    });
    expect((await opened.stored("note", "gen-title"))?.content).toBe(
      "Generated body text.",
    );
  });

  test("keeps a generated body's frontmatter, its title first", async () => {
    const opened = await store();
    reply = { title: "Fm Title", body: "---\nextra: kept\n---\nBody with fm" };
    expect(await generate(opened, { prompt: "x" })).toEqual({
      success: true,
      entityId: "fm-title",
      title: "Fm Title",
    });
    expect((await opened.stored("note", "fm-title"))?.content).toBe(
      "---\ntitle: Fm Title\nextra: kept\n---\nBody with fm\n",
    );
  });

  test("stores system_generate's stub and fills it", async () => {
    const opened = await store();
    const adapter = opened.shell.getEntityRegistry().getAdapter("note");
    const stub = adapter.buildStub?.({ id: "alloc", title: "Alloc" });
    if (!stub) throw new Error("The note builds no stub");
    await opened.service.createEntity({
      entity: { id: "alloc", entityType: "note", ...stub },
    });
    expect((await opened.stored("note", "alloc"))?.content).toBe(
      "---\ntitle: Alloc\nstatus: generating\n---\n\n",
    );
    reply = { title: "Ignored", body: "Filled body." };
    expect(
      await generate(opened, {
        prompt: "fill",
        title: "Alloc",
        entityId: "alloc",
      }),
    ).toEqual({ success: true, entityId: "alloc", title: "Alloc" });
    expect((await opened.stored("note", "alloc"))?.content).toBe(
      "---\ntitle: Alloc\n---\nFilled body.\n",
    );
  });
});

describe("a note captured for another package", () => {
  test("is stored private, as the note plugin class stored it", async () => {
    const opened = await store();
    await opened.shell.getMessageBus().send({
      type: noteCaptureContract.name,
      payload: {
        id: "visitor-question-1",
        title: "Visitor question",
        body: "What is a brain?",
      },
      sender: "web-chat",
    });
    const row = await opened.stored("note", "visitor-question-1");
    expect(row?.content).toBe(
      "---\ntitle: Visitor question\nvisibility: restricted\n---\nWhat is a brain?\n",
    );
  });
});
