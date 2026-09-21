import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import assert from "node:assert/strict";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type BaseEntity,
  type EntityAdapter,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { createSilentLogger, createMockLogger } from "@brains/test-utils";
import {
  documentAdapter,
  documentSchema,
  type DocumentEntity,
} from "@brains/document";
import { prepareAsset } from "@brains/assets";
import { parseMarkdown } from "@brains/utils/markdown";
import {
  DocumentGenerationJobHandler,
  getDocumentId,
  type DocumentGenerationJobData,
} from "../../src/handlers/documentGenerationHandler";
import {
  installDocumentFileFixture,
  fixturePdf,
  type DocumentFileFixture,
} from "../helpers/file-fixture";

function adapter(entityType: string): EntityAdapter<BaseEntity> {
  return {
    entityType,
    purpose: "Fixture",
    schema: baseEntitySchema,
    toMarkdown: (entity) => entity.content,
    fromMarkdown: (content) => ({ content }),
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (_content, schema) => schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}
function progress(failure?: Error): ProgressReporter {
  const value = CallbackProgressReporter.from(async (event) => {
    if (event.progress === 100 && failure) throw failure;
  });
  assert.ok(value);
  return value;
}
const base: DocumentGenerationJobData = {
  renderUrl: "http://127.0.0.1/preview",
  sourceEntityType: "deck",
  sourceEntityId: "deck-1",
  attachmentType: "carousel",
  documentId: "generated",
  dedupKey: "fixture-key",
};

describe("document file generation", () => {
  let context: ServicePluginContext;
  let fixture: DocumentFileFixture;
  let handler: DocumentGenerationJobHandler;
  beforeEach(() => {
    const shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "document");
    shell
      .getEntityRegistry()
      .registerEntityType("document", documentSchema, documentAdapter);
    for (const type of ["deck", "social-post"])
      shell
        .getEntityRegistry()
        .registerEntityType(type, baseEntitySchema, adapter(type));
    fixture = installDocumentFileFixture(context);
    handler = new DocumentGenerationJobHandler(createSilentLogger(), context, {
      withPreviewPdfFile: fixture.preview,
    });
  });
  const run = (
    data: DocumentGenerationJobData = base,
    reporter = progress(),
    signal = new AbortController().signal,
  ): ReturnType<DocumentGenerationJobHandler["process"]> =>
    handler.process(data, "job", reporter, signal);
  const stored = (id = "generated"): Promise<DocumentEntity | null> =>
    context.entityService.getEntity(
      { entityType: "document", id },
      documentSchema,
    );
  async function pending(): Promise<void> {
    await context.entityService.createEntity({
      entity: {
        id: "generated",
        ...documentAdapter.createPendingDocumentEntity({
          filename: "pending.pdf",
        }),
      },
    });
  }
  async function target(content = "Body"): Promise<void> {
    await context.entityService.createEntity({
      entity: {
        id: "target",
        entityType: "social-post",
        content,
        metadata: {},
      },
    });
  }
  function sourceProvider(): void {
    context.attachments.register("deck", "carousel", {
      withFile: async (_request, use, options): ReturnType<typeof use> => {
        fixture.state.held++;
        try {
          return await use(
            fixture.attachment(),
            options?.signal ?? new AbortController().signal,
          );
        } finally {
          fixture.state.held--;
        }
      },
    });
  }
  it("renders, inspects and atomically publishes a reference, with zero pages remaining unknown", async () => {
    const result = await run({ ...base, pageCount: 7, title: "Carousel" });
    expect(result).toEqual({
      success: true,
      documentId: "generated",
      reused: false,
    });
    expect((await stored())?.content).toBe(prepareAsset(fixturePdf).ref);
    expect((await stored())?.metadata).toMatchObject({
      status: "draft",
      pageCount: 0,
      sizeBytes: fixturePdf.length,
      title: "Carousel",
      filename: "generated.pdf",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
      dedupKey: "fixture-key",
    });
    expect(context.entityService.fileAssets?.publish).toHaveBeenCalledTimes(1);
    expect(fixture.state.held).toBe(0);
  });
  it("replaces a pending placeholder with the inspected asset", async () => {
    await pending();
    expect((await stored())?.content).toBe("");
    await run();
    expect((await stored())?.metadata.status).toBe("draft");
    expect((await stored())?.content).toBe(prepareAsset(fixturePdf).ref);
  });
  it("marks a pending document failed when rendering fails", async () => {
    await pending();
    const error = new Error("render failed");
    fixture.state.renderError = error;
    await assert.rejects(run(), (received: unknown) => received === error);
    expect((await stored())?.metadata).toMatchObject({
      status: "failed",
      processingError: "render failed",
    });
    expect((await stored())?.content).toBe("");
  });
  for (const committed of [false, true]) {
    it(`never follows an unavailable publication outcome with a failed mutation (committed=${committed})`, async () => {
      await pending();
      const error = new Error("publication reply unavailable");
      fixture.state.publicationError = error;
      fixture.state.publicationCommitted = committed;
      const updates = spyOn(context.entityService, "updateEntity");
      await assert.rejects(run(), (received: unknown) => received === error);
      expect((await stored())?.metadata.status).toBe(
        committed ? "draft" : "pending",
      );
      expect((await stored())?.metadata.processingError).toBeUndefined();
      expect(updates).toHaveBeenCalledTimes(committed ? 1 : 0);
    });
  }
  it("does not mark a saved document failed when target linkage fails", async () => {
    await pending();
    await assert.rejects(
      run({
        ...base,
        targetEntityType: "social-post",
        targetEntityId: "missing",
      }),
      /Target entity not found/,
    );
    expect((await stored())?.metadata.status).toBe("draft");
    expect((await stored())?.metadata.processingError).toBeUndefined();
  });
  it("preserves a saved document when final progress fails", async () => {
    await pending();
    const error = new Error("progress failed");
    await assert.rejects(
      run(base, progress(error)),
      (received: unknown) => received === error,
    );
    expect((await stored())?.metadata.status).toBe("draft");
    expect(fixture.state.held).toBe(0);
  });
  for (const same of [false, true]) {
    it(`preserves rendering and pending-update errors without duplicating identity (same=${same})`, async () => {
      await pending();
      const primary = new Error("render failed");
      const secondary = same ? primary : new Error("failure update failed");
      fixture.state.renderError = primary;
      spyOn(context.entityService, "updateEntity").mockRejectedValue(secondary);
      await assert.rejects(run(), (error: unknown) => {
        if (same) {
          expect(error).toBe(primary);
          return true;
        }
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, secondary]);
        expect(error.cause).toBe(primary);
        return true;
      });
    });
  }
  it("reuses a matching artifact without rendering or failing it after target failure", async () => {
    await fixture.seed("generated", { dedupKey: "fixture-key" });
    expect((await run()).reused).toBe(true);
    await assert.rejects(
      run({
        ...base,
        targetEntityType: "social-post",
        targetEntityId: "missing",
      }),
      /Target entity not found/,
    );
    expect(fixture.state.renders).toBe(0);
    expect((await stored())?.metadata.status).toBe("draft");
  });
  it("honors an explicitly requested identity despite a different deduped document", async () => {
    await fixture.seed("older", { dedupKey: "fixture-key" });
    expect((await run()).documentId).toBe("generated");
    expect(await stored("older")).not.toBeNull();
    expect(fixture.state.renders).toBe(1);
  });
  it("attaches a reused document to its target", async () => {
    await fixture.seed("generated", { dedupKey: "fixture-key" });
    await target();
    expect(
      (
        await run({
          ...base,
          targetEntityType: "social-post",
          targetEntityId: "target",
        })
      ).reused,
    ).toBe(true);
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "target",
    });
    assert.ok(entity);
    expect(parseMarkdown(entity.content).frontmatter["documents"]).toEqual([
      { id: "generated" },
    ]);
    expect(fixture.state.renders).toBe(0);
  });
  it("replace bypasses dedup without deleting the previous artifact", async () => {
    await fixture.seed("older", { dedupKey: "fixture-key" });
    await run({ ...base, replace: true });
    expect(await stored("older")).not.toBeNull();
    expect(await stored()).not.toBeNull();
    expect(fixture.state.renders).toBe(1);
  });
  it("freezes a source attachment inside its file scope", async () => {
    sourceProvider();
    await run({ ...base, renderUrl: undefined });
    expect((await stored())?.metadata.filename).toBe("source.pdf");
    expect(fixture.state.renders).toBe(0);
    expect(fixture.state.held).toBe(0);
  });
  it("keys source-derived artifacts on the current source content hash", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "deck-1",
        entityType: "deck",
        content: "first",
        metadata: {},
      },
    });
    sourceProvider();
    const input = {
      ...base,
      renderUrl: undefined,
      documentId: undefined,
      dedupKey: undefined,
    };
    const first = await run(input);
    const deck = await context.entityService.getEntity({
      entityType: "deck",
      id: "deck-1",
    });
    assert.ok(deck);
    await context.entityService.updateEntity({
      entity: { ...deck, content: "second" },
    });
    const second = await run(input);
    expect(second.documentId).not.toBe(first.documentId);
    expect(await stored(first.documentId)).not.toBeNull();
  });
  it("bounds ids while keeping content-hash variants distinct", () => {
    const input = {
      ...base,
      documentId: undefined,
      filename: undefined,
      sourceEntityId: "source-".repeat(80),
    };
    const first = getDocumentId(input, `${"long-".repeat(80)}hash-one`);
    const second = getDocumentId(input, `${"long-".repeat(80)}hash-two`);
    expect(first.length).toBeLessThanOrEqual(80);
    expect(second.length).toBeLessThanOrEqual(80);
    expect(first).not.toBe(second);
  });
  it("adds a generated reference and replaces only references for the same source attachment", async () => {
    await fixture.seed("old-same", {
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });
    await fixture.seed("other", {
      sourceEntityType: "deck",
      sourceEntityId: "deck-2",
      attachmentType: "carousel",
    });
    await target("---\ndocuments:\n  - id: old-same\n  - id: other\n---\nBody");
    await run({
      ...base,
      replace: true,
      targetEntityType: "social-post",
      targetEntityId: "target",
    });
    const entity = await context.entityService.getEntity({
      entityType: "social-post",
      id: "target",
    });
    assert.ok(entity);
    expect(parseMarkdown(entity.content).frontmatter["documents"]).toEqual([
      { id: "other" },
      { id: "generated" },
    ]);
    expect(await stored("old-same")).not.toBeNull();
  });
  it("warns about duplicate dedup keys and reuses the first matching artifact", async () => {
    await fixture.seed("first", { dedupKey: "fixture-key" });
    await fixture.seed("second", { dedupKey: "fixture-key" });
    const logger = createMockLogger();
    handler = new DocumentGenerationJobHandler(logger, context, {
      withPreviewPdfFile: fixture.preview,
    });
    const result = await run({ ...base, documentId: undefined });
    expect(result.documentId).toBe("first");
    expect(logger.warn).toHaveBeenCalled();
    expect(fixture.state.renders).toBe(0);
  });
  it("rejects declared page limits before rendering", async () => {
    await assert.rejects(run({ ...base, pageCount: 21 }), /maxPageCount=20/);
    expect(fixture.state.renders).toBe(0);
  });
  it("enforces independently inspected page and byte limits", async () => {
    fixture.state.pdf = new TextEncoder().encode(
      "%PDF-1.7\n/Type /Pages /Count 21\n%%EOF",
    );
    await assert.rejects(run(), /21 pages/);
    expect(context.entityService.fileAssets?.publish).not.toHaveBeenCalled();
    fixture.state.pdf = fixturePdf;
    await assert.rejects(run({ ...base, maxBytes: 1 }), /maxBytes=1/);
    expect(context.entityService.fileAssets?.publish).not.toHaveBeenCalled();
  });
  it("does not mark pending content failed when the borrowed file owner cancels", async () => {
    await pending();
    const owner = new AbortController();
    const reason = new Error("producer owner closed");
    const files = context.entityService.fileAssets;
    assert.ok(files);
    files.inspect = async (): Promise<never> => {
      owner.abort(reason);
      throw reason;
    };
    handler = new DocumentGenerationJobHandler(createSilentLogger(), context, {
      withPreviewPdfFile: async (
        input,
        transfers,
        use,
        options,
      ): ReturnType<typeof use> =>
        fixture.preview(
          input,
          transfers,
          (file) => use(file, owner.signal),
          options,
        ),
    });
    await assert.rejects(run(), (error: unknown) => error === reason);
    expect((await stored())?.metadata.status).toBe("pending");
    expect(files.publish).not.toHaveBeenCalled();
    expect(fixture.state.held).toBe(0);
  });

  it("preserves an acknowledged save and prevents target admission after cancellation", async () => {
    await pending();
    const abort = new AbortController();
    const files = context.entityService.fileAssets;
    assert.ok(files);
    const publish = files.publish;
    files.publish = async (input, options): ReturnType<typeof publish> => {
      const outcome = await publish(input, options);
      abort.abort(new Error("cancel after save"));
      return outcome;
    };
    const result = await run(
      { ...base, targetEntityType: "social-post", targetEntityId: "missing" },
      progress(),
      abort.signal,
    );
    expect(result).toEqual({
      success: true,
      documentId: "generated",
      reused: false,
      warning: "Document saved; target update cancelled",
    });
    expect((await stored())?.metadata.status).toBe("draft");
    expect(fixture.state.held).toBe(0);
  });

  it("retains a saved artifact when source retirement fails after acknowledgement", async () => {
    await pending();
    const error = new Error("source retirement failed");
    fixture.state.cleanupError = error;
    await assert.rejects(run(), (received: unknown) => received === error);
    expect((await stored())?.metadata.status).toBe("draft");
    expect((await stored())?.metadata.processingError).toBeUndefined();
    expect(context.entityService.fileAssets?.publish).toHaveBeenCalledTimes(1);
    expect(fixture.state.held).toBe(0);
  });

  it("rejects a mismatched inspection receipt before publication", async () => {
    await pending();
    const files = context.entityService.fileAssets;
    assert.ok(files);
    const inspect = files.inspect;
    files.inspect = async (source, options): ReturnType<typeof inspect> => ({
      ...(await inspect(source, options)),
      sha256: "0".repeat(64),
    });
    await assert.rejects(run(), /does not match/);
    expect(files.publish).not.toHaveBeenCalled();
    expect((await stored())?.metadata.status).toBe("failed");
  });

  it("cancellation before work does not render or mark a pending entity failed", async () => {
    await pending();
    const cancel = new AbortController();
    const reason = new Error("cancelled");
    cancel.abort(reason);
    await assert.rejects(
      run(base, progress(), cancel.signal),
      (error: unknown) => error === reason,
    );
    expect(fixture.state.renders).toBe(0);
    expect((await stored())?.metadata.status).toBe("pending");
  });
});
