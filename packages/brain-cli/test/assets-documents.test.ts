import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  computeAssetDigest,
  createAssetRef,
  openOfflineEntityDatabase,
} from "@brains/entity-service";
import { LEGACY_PENDING_DOCUMENT_PLACEHOLDER } from "@brains/document";
import { z } from "@brains/utils/zod";
import { runAssetsMigrate } from "../src/commands/assets-migrate";
import { runAssetsReconcile } from "../src/commands/assets-reconcile";
import { runAssetsVerify } from "../src/commands/assets-verify";
import {
  dataUrl,
  fixture,
  PDF,
  pdfDataUrl,
  PNG,
  removeFixtures,
  stopped,
} from "./helpers/binary-asset-fixture";

/**
 * Documents are asset-backed like images: the offline commands migrate
 * their inline PDFs, verify their references and mirrored files, and
 * rebuild them from brain-data, beside the images.
 */

afterEach(removeFixtures);

const pdfRef = createAssetRef(computeAssetDigest(PDF));
const documentMetadata = { mimeType: "application/pdf", filename: "deck.pdf" };

async function row(
  path: string,
  id: string,
): Promise<{ content: string; metadata: Record<string, unknown> } | undefined> {
  const client = openOfflineEntityDatabase(path).client;
  try {
    const result = await client.execute({
      sql: "SELECT content, metadata FROM entities WHERE entityType = 'document' AND id = ?",
      args: [id],
    });
    const found = result.rows[0];
    return found
      ? {
          content: String(found["content"]),
          metadata: z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(String(found["metadata"]))),
        }
      : undefined;
  } finally {
    client.close();
  }
}

async function addDocumentFts(path: string, id: string): Promise<void> {
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute({
      sql: "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, 'document', 'inline')",
      args: [id],
    });
  } finally {
    client.close();
  }
}

describe("assets:migrate with documents", () => {
  it("reports inline documents beside images in a dry-run", async () => {
    const path = await fixture([
      ["cover", dataUrl("png", PNG)],
      ["deck", pdfDataUrl(PDF), "document", documentMetadata],
      ["broken", "data:application/pdf;base64,aGVsbG8=", "document"],
    ]);

    const result = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("1 inline image(s): 1 ready, 0 blocked");
    expect(result.message).toContain(
      "2 inline document(s): 1 ready, 1 blocked",
    );
    expect(result.message).toContain("blocked broken: unsupported");
    expect(result.message).toContain("the bytes are not a PDF");
  });

  it("moves inline PDFs into assets, keeping their metadata and recording their size", async () => {
    const path = await fixture([
      ["cover", dataUrl("png", PNG)],
      ["deck", pdfDataUrl(PDF), "document", documentMetadata],
      ["deck-copy", pdfDataUrl(PDF), "document", documentMetadata],
    ]);
    await addDocumentFts(path, "deck");
    const manifestPath = join(dirname(path), "manifest.json");

    const result = await runAssetsMigrate(
      "/",
      { database: path, manifest: manifestPath },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Migrated 1 image(s), 2 document(s)");
    expect(await row(path, "deck")).toEqual({
      content: pdfRef,
      metadata: { ...documentMetadata, sizeBytes: PDF.byteLength },
    });
    expect((await row(path, "deck-copy"))?.content).toBe(pdfRef);
    const manifest = await readFile(manifestPath, "utf8");
    expect(manifest).not.toContain("base64");
    expect(manifest).toContain('"entityType": "document"');

    const verified = await runAssetsVerify("/", { database: path }, stopped);
    expect(verified.success).toBe(true);
    expect(verified.message).toContain(
      "2 asset-backed document(s): 2 valid, 0 broken.",
    );
  });

  it("clears the old placeholder a pending document held", async () => {
    const path = await fixture([
      [
        "pending-deck",
        LEGACY_PENDING_DOCUMENT_PLACEHOLDER,
        "document",
        { ...documentMetadata, status: "pending" },
      ],
    ]);

    const result = await runAssetsMigrate("/", { database: path }, stopped);

    expect(result.success).toBe(true);
    expect((await row(path, "pending-deck"))?.content).toBe("");
  });
});

describe("assets:verify with documents", () => {
  it("fails while an inline document is left, and compares mirrored PDFs", async () => {
    const path = await fixture([
      ["deck", pdfDataUrl(PDF), "document", documentMetadata],
    ]);
    const inline = await runAssetsVerify("/", { database: path }, stopped);
    expect(inline.success).toBe(false);
    expect(inline.message).toContain("1 inline document(s) left");

    await runAssetsMigrate("/", { database: path }, stopped);
    const brainData = join(dirname(path), "brain-data");
    await mkdir(join(brainData, "document"), { recursive: true });
    await writeFile(join(brainData, "document", "deck.pdf"), PDF);

    const result = await runAssetsVerify(
      "/",
      { database: path, brainData },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("1 mirrored file(s) match.");
  });
});

describe("assets:reconcile with documents", () => {
  it("creates a document from a PDF and its sidecar", async () => {
    const path = await fixture([]);
    const from = join(dirname(path), "brain-data");
    await mkdir(join(from, "document"), { recursive: true });
    await writeFile(join(from, "document", "deck.pdf"), PDF);
    await writeFile(
      join(from, "document", "deck.pdf.meta.json"),
      JSON.stringify({ filename: "deck.pdf", pageCount: 1 }),
    );

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("documents:\ncreated: deck");
    expect(await row(path, "deck")).toEqual({
      content: pdfRef,
      metadata: {
        mimeType: "application/pdf",
        filename: "deck.pdf",
        pageCount: 1,
        sizeBytes: PDF.byteLength,
      },
    });
  });

  it("reports a document whose reference disagrees with its file and changes nothing", async () => {
    const path = await fixture([
      ["deck", createAssetRef("a".repeat(64)), "document", documentMetadata],
    ]);
    const from = join(dirname(path), "brain-data");
    await mkdir(join(from, "document"), { recursive: true });
    await writeFile(join(from, "document", "deck.pdf"), PDF);

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("documents:\nmismatch: deck");
    expect((await row(path, "deck"))?.content).toBe(
      createAssetRef("a".repeat(64)),
    );
  });
});
