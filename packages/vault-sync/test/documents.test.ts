import { afterEach, describe, expect, it } from "bun:test";
import { placementOf } from "../src";
import { connect, fresh, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);
const PDF = bytesOf(
  "%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 >> endobj\n%%EOF\n",
);
const OTHER_PDF = bytesOf(
  "%PDF-1.7\n1 0 obj << /Type /Pages /Count 5 >> endobj\n%%EOF\n",
);

async function connected(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n");
  await connect(made);
  return made;
}

/**
 * A PDF is the brain's like an image is: one in the vault's `document/`
 * folder is a document entry, and the brain's documents are files there.
 */
describe("PDFs", () => {
  it("uploads a PDF put in document/", async () => {
    synced = await connected();
    await synced.vault.write("document/handbook.pdf", PDF);

    const report = await synced.engine.sync();

    expect(report.uploaded).toEqual(["document/handbook.pdf"]);
    expect(report.issues).toEqual([]);
    const stored = await synced.brain.get("document", "handbook");
    expect(stored?.metadata).toMatchObject({
      mimeType: "application/pdf",
      filename: "handbook.pdf",
      pageCount: 2,
    });
    // In step afterwards: nothing more to do.
    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });

  it("downloads the brain's PDFs to another device", async () => {
    synced = await connected();
    await synced.vault.write("document/handbook.pdf", PDF);
    await synced.engine.sync();
    const other = synced.device();

    await connect(other);

    expect(other.vault.files.get("document/handbook.pdf")?.bytes).toEqual(PDF);
  });

  it("replaces a PDF that was replaced in the vault", async () => {
    synced = await connected();
    await synced.vault.write("document/handbook.pdf", PDF);
    await synced.engine.sync();
    const other = synced.device();
    await connect(other);
    await synced.vault.write("document/handbook.pdf", OTHER_PDF);

    const report = await synced.engine.sync();
    await other.engine.sync();

    expect(report.uploaded).toEqual(["document/handbook.pdf"]);
    expect(
      (await synced.brain.get("document", "handbook"))?.metadata["pageCount"],
    ).toBe(5);
    expect(other.vault.files.get("document/handbook.pdf")?.bytes).toEqual(
      OTHER_PDF,
    );
  });

  it("deletes the brain's document when its PDF is deleted in the vault", async () => {
    synced = await connected();
    await synced.vault.write("document/handbook.pdf", PDF);
    await synced.engine.sync();
    await synced.vault.trash("document/handbook.pdf");
    await synced.engine.noteDeleted("document/handbook.pdf");

    const report = await synced.engine.sync();

    expect(report.deletedInBrain).toEqual(["document/handbook.pdf"]);
    expect(await synced.brain.get("document", "handbook")).toBeNull();
  });

  it("leaves a file that is not a PDF with the brain's reason", async () => {
    synced = await connected();
    await synced.vault.write("document/fake.pdf", bytesOf("just text"));

    const report = await synced.engine.sync();

    expect(report.uploaded).toEqual([]);
    expect(
      [...report.issues, ...report.localOnly].map((note) => note.path),
    ).toEqual(["document/fake.pdf"]);
    expect([...report.issues, ...report.localOnly][0]?.reason).toContain(
      "not a PDF",
    );
    expect(await synced.brain.get("document", "fake")).toBeNull();
  });

  it("keeps a PDF that lost to a newer one in Conflicts", async () => {
    synced = await connected();
    await synced.vault.write("document/handbook.pdf", PDF);
    await synced.engine.sync();
    const other = synced.device();
    await connect(other);
    await other.vault.write("document/handbook.pdf", OTHER_PDF);
    await other.engine.sync();
    const MINE = bytesOf("%PDF-1.7\nmine\n%%EOF\n");
    await synced.vault.write("document/handbook.pdf", MINE);

    const report = await synced.engine.sync();

    expect(report.notices.map((notice) => notice.kind)).toEqual(["conflict"]);
    expect(synced.vault.files.get("document/handbook.pdf")?.bytes).toEqual(
      OTHER_PDF,
    );
    const [open] = await synced.engine.openConflicts();
    expect(open?.path).toBe("document/handbook.pdf");
    expect(open?.flavor).toBe("file");
    expect(synced.vault.files.get(open?.copy ?? "")?.bytes).toEqual(MINE);
  });
});

describe("where a PDF belongs", () => {
  const folders = new Set(["document", "image", "post"]);

  it("is the document folder", () => {
    expect(placementOf("document/handbook.pdf", folders)).toEqual({
      kind: "synced",
      flavor: "file",
    });
    expect(placementOf("document/Handbook.PDF", folders)).toEqual({
      kind: "synced",
      flavor: "file",
    });
  });

  it("says so for a PDF anywhere else", () => {
    const top = placementOf("handbook.pdf", folders);
    const elsewhere = placementOf("post/handbook.pdf", folders);

    expect(top.kind === "local" && top.reason).toContain("document folder");
    expect(elsewhere.kind === "local" && elsewhere.reason).toContain(
      "document folder",
    );
  });

  it("holds PDFs only", () => {
    const other = placementOf("document/notes.docx", folders);

    expect(other.kind === "local" && other.reason).toBe(
      "The document folder holds PDFs.",
    );
  });

  it("stays in the vault on a brain without documents", () => {
    const placed = placementOf("document/handbook.pdf", new Set(["image"]));

    expect(placed.kind).toBe("local");
  });
});
