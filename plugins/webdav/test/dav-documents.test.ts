import { describe, expect, it } from "bun:test";
import { doc, drive } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const bytesOf = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(new TextEncoder().encode(text));

/** A two-page PDF, as far as the brain reads one: its signature and its page tree. */
const PDF = bytesOf(
  "%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 >> endobj\n%%EOF\n",
);
const OTHER_PDF = bytesOf(
  "%PDF-1.7\n1 0 obj << /Type /Pages /Count 5 >> endobj\n%%EOF\n",
);
const OLD = bytesOf("%PDF-1.4\nold\n%%EOF\n");
const OLD_REF = `asset://sha256/${"c".repeat(64)}` as const;

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "readme", { content: doc("Readme") }),
      entity("post", "first", { content: doc("First") }),
      entity("document", "report", {
        content: OLD_REF,
        metadata: {
          mimeType: "application/pdf",
          filename: "Annual report.pdf",
          title: "Annual report",
          pageCount: 1,
          sourceEntityType: "post",
          sourceEntityId: "first",
        },
      }),
      entity("document", "board-minutes", {
        content: OLD_REF,
        metadata: { mimeType: "application/pdf", filename: "minutes.pdf" },
        visibility: "restricted",
      }),
    ],
    ["note", "post", "image", "document"],
    { [OLD_REF]: OLD },
  );
}

/**
 * A PDF is a file of the brain's like an image is: kept in `document/`,
 * named by its id, stored by its bytes. A notes app puts one there, replaces
 * it and removes it as it does an image.
 */
describe("WebDAV document files", () => {
  it("creates a document from a new PDF, public and only if absent", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/document/handbook.pdf", {
      body: PDF,
    });

    expect(response.status).toBe(201);
    expect(brain.creates[0]?.entity).toMatchObject({
      entityType: "document",
      id: "handbook",
      visibility: "public",
      metadata: {
        mimeType: "application/pdf",
        filename: "handbook.pdf",
        pageCount: 2,
        sizeBytes: PDF.byteLength,
        attachmentType: "uploaded",
      },
    });
    expect(brain.creates[0]?.entity.content).toMatch(
      /^asset:\/\/sha256\/[0-9a-f]{64}$/,
    );
    const read = await dav("GET", "/dav/document/handbook.pdf");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PDF);
    expect(read.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("etag")).toBe(read.headers.get("etag"));

    // The id is taken by a document this person cannot see.
    expect(
      (await dav("PUT", "/dav/document/board-minutes.pdf", { body: PDF }))
        .status,
    ).toBe(412);
    expect(brain.discarded).toHaveLength(1);
  });

  it("replaces a document's bytes and keeps what describes it", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/document/report.pdf", {
      body: OTHER_PDF,
    });

    expect(response.status).toBe(204);
    const saved = brain.entities.find((one) => one.id === "report");
    expect(saved?.content).not.toBe(OLD_REF);
    expect(saved?.metadata).toEqual({
      mimeType: "application/pdf",
      filename: "Annual report.pdf",
      title: "Annual report",
      pageCount: 5,
      sizeBytes: OTHER_PDF.byteLength,
      sourceEntityType: "post",
      sourceEntityId: "first",
    });
    expect(brain.updates[0]).toMatchObject({
      expectedContentHash: "hash-document-report",
      interfaceType: "webdav",
    });
    expect(
      new Uint8Array(
        await (await dav("GET", "/dav/document/report.pdf")).arrayBuffer(),
      ),
    ).toEqual(OTHER_PDF);
    expect(brain.discarded).toEqual([]);
  });

  it("is a whole document once a file is put where a failed one's was", async () => {
    const brain = fakeBrain(
      [
        entity("document", "carousel", {
          content: OLD_REF,
          metadata: {
            mimeType: "application/pdf",
            filename: "carousel.pdf",
            status: "failed",
            processingJobId: "job-1",
            processingError: "The render timed out",
            dedupKey: "carousel:post:first",
          },
        }),
      ],
      ["document"],
      { [OLD_REF]: OLD },
    );
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/document/carousel.pdf", {
      body: PDF,
    });

    expect(response.status).toBe(204);
    // It has its bytes: it is no longer waiting for them, or failed.
    expect(brain.entities[0]?.metadata).toEqual({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      dedupKey: "carousel:post:first",
      pageCount: 2,
      sizeBytes: PDF.byteLength,
    });
  });

  it("replaces only the version a save names", async () => {
    const brain = library();
    const dav = drive(brain);

    const stale = await dav("PUT", "/dav/document/report.pdf", {
      headers: { "if-match": '"another-version"' },
      body: OTHER_PDF,
    });
    const absent = await dav("PUT", "/dav/document/report.pdf", {
      headers: { "if-none-match": "*" },
      body: OTHER_PDF,
    });

    expect(stale.status).toBe(412);
    expect(absent.status).toBe(412);
    expect(brain.updates).toEqual([]);
  });

  it("takes only PDFs, and only in the document folder", async () => {
    const brain = library();
    const dav = drive(brain);

    const notPdf = await dav("PUT", "/dav/document/fake.pdf", {
      body: bytesOf("just text"),
    });
    const elsewhere = await dav("PUT", "/dav/post/handbook.pdf", { body: PDF });
    const atRoot = await dav("PUT", "/dav/handbook.pdf", { body: PDF });

    expect(notPdf.status).toBe(422);
    expect(await notPdf.text()).toBe("The file is not a PDF");
    expect(elsewhere.status).toBe(403);
    expect(await elsewhere.text()).toBe(
      "A PDF can only be stored in the document folder",
    );
    expect(atRoot.status).toBe(403);
    expect(brain.creates).toEqual([]);
    expect(brain.discarded).toEqual([]);
  });

  it("applies the action policy before any bytes are stored", async () => {
    const brain = library();
    brain.options.writes.permissions = {
      assertEntityActionAllowed: (): void => {
        throw new Error("Documents are managed elsewhere.");
      },
    };
    const dav = drive(brain);

    expect(
      (await dav("PUT", "/dav/document/handbook.pdf", { body: PDF })).status,
    ).toBe(403);
    expect(
      (await dav("PUT", "/dav/document/report.pdf", { body: PDF })).status,
    ).toBe(403);
    expect(brain.discarded).toEqual([]);
    expect(Object.keys(brain.assets)).toEqual([OLD_REF]);
  });

  it("refuses a read-only app password", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/document/handbook.pdf", {
      as: { access: "read" },
      body: PDF,
    });

    expect(response.status).toBe(403);
    expect(brain.creates).toEqual([]);
  });

  it("deletes a document by deleting its file", async () => {
    const brain = library();
    const dav = drive(brain);
    const read = await dav("GET", "/dav/document/report.pdf");

    const response = await dav("DELETE", "/dav/document/report.pdf", {
      headers: { "if-match": read.headers.get("etag") ?? "" },
    });

    expect(response.status).toBe(204);
    expect(brain.deletes).toEqual([{ entityType: "document", id: "report" }]);
  });

  it("does not store the old placeholder a pending document carried", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", "/dav/document/pending.pdf", {
      body: bytesOf("%PDF-1.4\n% Pending document placeholder\n%%EOF\n"),
    });

    expect(response.status).toBe(422);
    expect(brain.creates).toEqual([]);
  });
});
