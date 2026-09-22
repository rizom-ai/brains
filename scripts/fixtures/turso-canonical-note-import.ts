import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { App } from "@brains/app";
import { CallbackProgressReporter } from "@brains/utils/progress";

/** Generate a tiny fixture PDF; production PDF reads/decoding occur only in the
 * named actor. Exercise the registered worker handler against the real owner. */
export async function importCanonicalNote(
  app: App,
  directory: string,
): Promise<void> {
  const stream = "BT /F1 12 Tf 72 720 Td (Native note extraction) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const path = join(directory, "note-source.pdf");
  await writeFile(path, pdf, { flag: "wx" });
  const shell = app.getShell();
  const store = shell.getRuntimeUploadRegistry().scoped({
    namespace: "upload",
    refKind: "upload",
    routePath: "/api/chat/uploads",
  });
  const upload = await store.saveFile({
    filename: "native-note.pdf",
    mediaType: "application/pdf",
    sourceFile: path,
    sizeBytes: Buffer.byteLength(pdf),
  });
  const service = shell.getEntityService();
  await service.createEntity({
    entity: {
      entityType: "note",
      id: "canonical-extracted-note",
      content: "---\ntitle: Native note\nstatus: generating\n---\n",
      metadata: { title: "Native note" },
      visibility: "shared",
    },
  });
  const before = await service.getEntity({
    entityType: "note",
    id: "canonical-extracted-note",
    visibilityScope: "restricted",
  });
  assert.ok(before);
  const handler = shell.getJobQueueService().getHandler("note:upload-import");
  assert.ok(handler);
  const reporter = CallbackProgressReporter.from(
    async (): Promise<void> => undefined,
  );
  assert.ok(reporter);
  assert.deepEqual(
    await handler.process(
      {
        uploadId: upload.id,
        entityId: before.id,
        stubContentHash: before.contentHash,
      },
      "canonical-note-import",
      reporter,
      new AbortController().signal,
    ),
    { entityId: before.id, status: "created" },
  );
  const saved = await service.getEntity({
    entityType: "note",
    id: before.id,
    visibilityScope: "restricted",
  });
  assert.ok(saved);
  assert.match(saved.content, /Native note extraction/);
  assert.doesNotMatch(saved.content, /status: generating|status: failed/);
  assert.equal(saved.visibility, "shared");
}
