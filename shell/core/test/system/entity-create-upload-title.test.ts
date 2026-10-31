import {
  expectConfirmationArgs,
  expectToolConfirmation,
} from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
import { uploadContext, uploadFixture } from "./upload-fixtures";

const meetingUpload = {
  id: "upload-00000000-0000-4000-8000-000000000a01",
  filename: "2026-10-meeting.md",
  mediaType: "text/markdown",
  content: "Opening line\n\n# Quarterly Planning Sync\n\n- Ship the import.\n",
};

const pdfUpload = {
  id: "upload-00000000-0000-4000-8000-000000000a02",
  filename: "primer.pdf",
  mediaType: "application/pdf",
  content: "%PDF-1.4",
};

function importRequest(
  upload: { id: string },
  title?: string,
): Record<string, unknown> {
  return {
    entityType: "note",
    ...(title !== undefined ? { title } : {}),
    source: {
      kind: "upload",
      upload: { kind: "upload", id: upload.id },
      transform: "extract-markdown",
    },
  };
}

describe("system_create upload note titles", () => {
  it("titles an imported note by the upload's first # heading", async () => {
    const { tool, noteImports } = uploadFixture([meetingUpload]);

    const pending = await tool.handler(
      importRequest(meetingUpload),
      uploadContext(),
    );

    const confirmation = expectToolConfirmation(pending);
    const args = expectConfirmationArgs(pending);
    expect(confirmation.summary).toBe('Create "Quarterly Planning Sync"?');
    expect(confirmation.completionSummary).toBe(
      'Saved note "Quarterly Planning Sync".',
    );
    expect(confirmation.preview).toContain("Title: Quarterly Planning Sync");
    expect(args).toMatchObject({ title: "Quarterly Planning Sync" });

    const saved = await tool.handler(args, uploadContext());

    expect(saved).toMatchObject({ success: true });
    expect(noteImports).toEqual([
      expect.objectContaining({
        entityType: "note",
        title: "Quarterly Planning Sync",
        from: { kind: "upload", id: meetingUpload.id },
      }),
    ]);
  });

  it("keeps a title the user stated over the heading", async () => {
    const { tool, noteImports } = uploadFixture([meetingUpload]);

    const pending = await tool.handler(
      importRequest(meetingUpload, "Planning Notes"),
      uploadContext(),
    );
    const saved = await tool.handler(
      expectConfirmationArgs(pending),
      uploadContext(),
    );

    expect(saved).toMatchObject({ success: true });
    expect(noteImports[0]?.title).toBe("Planning Notes");
  });

  it.each(["2026-10-meeting.md", "2026-10-meeting", " 2026-10-meeting.md "])(
    "reads a title that only repeats the file name (%p) as no title",
    async (fileNameTitle) => {
      const { tool, noteImports } = uploadFixture([meetingUpload]);

      const pending = await tool.handler(
        importRequest(meetingUpload, fileNameTitle),
        uploadContext(),
      );
      await tool.handler(expectConfirmationArgs(pending), uploadContext());

      expect(noteImports[0]?.title).toBe("Quarterly Planning Sync");
    },
  );

  it("falls back to the file name for an upload without a # heading", async () => {
    const { tool, noteImports } = uploadFixture([pdfUpload]);

    const pending = await tool.handler(
      importRequest(pdfUpload),
      uploadContext(),
    );
    expect(expectToolConfirmation(pending).summary).toBe('Create "primer"?');
    await tool.handler(expectConfirmationArgs(pending), uploadContext());

    expect(noteImports[0]?.title).toBe("primer");
  });

  it("refuses an import whose heading names a note that already exists", async () => {
    const { tool, services, noteImports } = uploadFixture([meetingUpload]);
    services.addEntities([
      {
        id: "quarterly-planning-sync",
        entityType: "note",
        content: "# Quarterly Planning Sync\n\nEarlier notes.",
        contentHash: "hash",
        metadata: { title: "Quarterly Planning Sync" },
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
      },
    ]);

    const result = await tool.handler(
      importRequest(meetingUpload),
      uploadContext(),
    );

    expect(result).toMatchObject({ success: false });
    expect(noteImports).toEqual([]);
  });
});

describe("system_create save confirmations", () => {
  it("says what a confirmed save saved", async () => {
    const photo = {
      id: "upload-00000000-0000-4000-8000-000000000a03",
      filename: "harbor.png",
      mediaType: "image/png",
      content: "png",
    };
    const { tool } = uploadFixture([photo]);

    const pending = await tool.handler(
      {
        entityType: "image",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: photo.id },
          transform: "preserve",
        },
      },
      uploadContext(),
    );

    expect(expectToolConfirmation(pending)).toMatchObject({
      summary: 'Save uploaded file as "harbor"?',
      completionSummary: 'Saved image "harbor".',
    });
  });
});
