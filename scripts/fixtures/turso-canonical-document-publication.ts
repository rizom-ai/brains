import assert from "node:assert/strict";
import type { App } from "@brains/app";
import type { AttachmentFile } from "@brains/plugins";
import { documentAdapter, documentSchema } from "@brains/document";
import { CallbackProgressReporter } from "@brains/utils/progress";

/** Reuse the existing live producer loan, not a second browser or byte buffer.
 * The installed job handler still performs its own native inspection and atomic
 * pending-row/asset/reference/projection/outbox publication. */
export async function publishCanonicalDocument(
  app: App,
  file: AttachmentFile,
  signal: AbortSignal,
): Promise<void> {
  const shell = app.getShell();
  const service = shell.getEntityService();
  const registry = shell.getAttachmentRegistry();
  let entries = 0;
  const unregister = registry.register("post", "canonical-pdf-loan", {
    withFile: async (_request, use, options): ReturnType<typeof use> => {
      assert.equal(++entries, 1);
      return use(
        file,
        AbortSignal.any([signal, ...(options?.signal ? [options.signal] : [])]),
      );
    },
  });
  try {
    await service.createEntity({
      entity: {
        id: "canonical-rendered-document",
        ...documentAdapter.createPendingDocumentEntity({
          filename: file.filename,
        }),
        visibility: "shared",
      },
    });
    const handler = shell.getJobQueueService().getHandler("document:generate");
    assert.ok(handler);
    const input = handler.validateAndParse({
      sourceEntityType: "post",
      sourceEntityId: "render-source",
      attachmentType: "canonical-pdf-loan",
      documentId: "canonical-rendered-document",
      dedupKey: "canonical-live-pdf",
    });
    assert.ok(input);
    const reporter = CallbackProgressReporter.from(
      async (): Promise<void> => undefined,
    );
    assert.ok(reporter);
    assert.deepEqual(
      await handler.process(
        input,
        "canonical-document-generation",
        reporter,
        signal,
      ),
      {
        success: true,
        documentId: "canonical-rendered-document",
        reused: false,
      },
    );
    const stored = documentSchema.parse(
      await service.getEntity({
        entityType: "document",
        id: "canonical-rendered-document",
        visibilityScope: "restricted",
      }),
    );
    assert.equal(stored.content, `asset://sha256/${file.sha256}`);
    assert.equal(stored.metadata.sizeBytes, file.source.sizeBytes);
    assert.ok(stored.metadata.pageCount && stored.metadata.pageCount > 0);
    assert.equal(stored.metadata.status, "draft");
    assert.equal(stored.visibility, "shared");
    assert.equal(entries, 1);
  } finally {
    unregister();
  }
}
