import { describe, expect, it } from "bun:test";
import type { FileUIPart } from "ai";
import { preparePromptSubmitFiles } from "../ui-react/src/prompt-files";
import {
  classifySubmitError,
  createUploadMessageParts,
  createUploadPart,
  defaultUploadFilename,
  getFileUploadName,
  parseUploadPartData,
  prepareUploadSubmission,
  uploadEndpoint,
  uploadFilePart,
  type UploadFetch,
  type WebChatUploadResponse,
} from "../ui-react/src/uploads";

function makeUploadResponse(
  overrides: Partial<WebChatUploadResponse> = {},
): WebChatUploadResponse {
  return {
    id: "upload-123",
    ref: { kind: "upload", id: "upload-123" },
    filename: "notes.md",
    mediaType: "text/markdown",
    sizeBytes: 12,
    createdAt: "2026-05-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("web chat upload protocol", () => {
  it("parses valid upload response data", () => {
    const parsed = parseUploadPartData(makeUploadResponse());

    expect(parsed).toEqual(makeUploadResponse());
  });

  it("rejects malformed upload response data", () => {
    expect(parseUploadPartData({ ...makeUploadResponse(), filename: "" })).toBe(
      null,
    );
    expect(
      parseUploadPartData({
        ...makeUploadResponse(),
        ref: { kind: "other", id: "upload-123" },
      }),
    ).toBe(null);
  });

  it("creates AI SDK data-upload parts", () => {
    const upload = parseUploadPartData(makeUploadResponse());
    if (!upload) throw new Error("expected valid upload");

    expect(createUploadPart(upload)).toEqual({
      type: "data-upload",
      data: upload,
    });
  });

  it("builds chat message parts from text and upload refs", () => {
    const upload = parseUploadPartData(makeUploadResponse());
    if (!upload) throw new Error("expected valid upload");

    expect(createUploadMessageParts("Summarize", [upload])).toEqual([
      { type: "text", text: "Summarize" },
      { type: "data-upload", data: upload },
    ]);
    expect(createUploadMessageParts("", [upload])).toEqual([
      { type: "data-upload", data: upload },
    ]);
  });

  it("prepares text-only submissions without uploading", async () => {
    const submission = await prepareUploadSubmission("Hello", [], async () => {
      throw new Error("should not upload without files");
    });

    expect(submission).toEqual({
      uploadedFiles: [],
      payload: { text: "Hello" },
      title: "Hello",
      uploadNoticeMessage: null,
    });
  });

  it("uploads prompt files and prepares durable upload-ref message parts", async () => {
    const file: FileUIPart = {
      type: "file",
      filename: "notes.md",
      mediaType: "text/markdown",
      url: "blob:notes",
    };
    const upload = makeUploadResponse();
    const uploadedFilenames: string[] = [];

    const submission = await prepareUploadSubmission(
      "Summarize",
      [file],
      async (nextFile) => {
        uploadedFilenames.push(nextFile.filename ?? "");
        return upload;
      },
    );

    expect(uploadedFilenames).toEqual(["notes.md"]);
    expect(submission).toEqual({
      uploadedFiles: [upload],
      payload: {
        parts: [
          { type: "text", text: "Summarize" },
          { type: "data-upload", data: upload },
        ],
      },
      title: "Summarize",
      uploadNoticeMessage: "Sent attachment: notes.md",
    });
  });

  it("uses the uploaded filename as the pending title for attachment-only submissions", async () => {
    const file: FileUIPart = {
      type: "file",
      filename: "notes.md",
      mediaType: "text/markdown",
      url: "blob:notes",
    };
    const upload = makeUploadResponse();

    const submission = await prepareUploadSubmission(
      "",
      [file],
      async () => upload,
    );

    expect(submission.title).toBe("notes.md");
    expect(submission.payload).toEqual({
      parts: [{ type: "data-upload", data: upload }],
    });
  });

  it("derives a safe display name for file upload parts", () => {
    expect(
      getFileUploadName({
        type: "file",
        mediaType: "text/plain",
        url: "blob:1",
      }),
    ).toBe(defaultUploadFilename);
    expect(
      getFileUploadName({
        type: "file",
        filename: "notes.txt",
        mediaType: "text/plain",
        url: "blob:1",
      }),
    ).toBe("notes.txt");
  });

  it("prepares prompt files without converting blob URLs to inline data URLs", () => {
    const files = preparePromptSubmitFiles([
      {
        id: "file-1",
        type: "file",
        filename: "notes.md",
        mediaType: "text/markdown",
        url: "blob:notes",
      },
    ]);

    expect(files).toEqual([
      {
        type: "file",
        filename: "notes.md",
        mediaType: "text/markdown",
        url: "blob:notes",
      },
    ]);
  });

  it("uploads file parts through the multipart endpoint", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const file: FileUIPart = {
      type: "file",
      filename: "notes.md",
      mediaType: "text/markdown",
      url: "blob:notes",
    };
    const fetchFn: UploadFetch = async (input, init) => {
      calls.push({ input, init });
      if (input === "blob:notes") {
        return new Response(new Blob(["# Notes"], { type: "text/markdown" }));
      }
      if (input === uploadEndpoint) {
        const body = init?.body;
        expect(body).toBeInstanceOf(FormData);
        const uploadFile = (body as FormData).get("file");
        expect(uploadFile).toBeInstanceOf(File);
        expect((uploadFile as File).name).toBe("notes.md");
        expect((uploadFile as File).type).toBe("text/markdown");
        expect(await (uploadFile as File).text()).toBe("# Notes");
        return Response.json(makeUploadResponse(), { status: 201 });
      }
      return new Response("not found", { status: 404 });
    };

    const upload = await uploadFilePart(file, fetchFn);

    expect(upload).toEqual(makeUploadResponse());
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
    });
  });

  it("throws when the upload response is malformed", async () => {
    const file: FileUIPart = {
      type: "file",
      filename: "notes.md",
      mediaType: "text/markdown",
      url: "blob:notes",
    };
    const fetchFn: UploadFetch = async (input) => {
      if (input === "blob:notes") {
        return new Response(new Blob(["# Notes"], { type: "text/markdown" }));
      }
      return Response.json({ ok: true }, { status: 201 });
    };

    let thrown: unknown;
    try {
      await uploadFilePart(file, fetchFn);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown instanceof Error ? thrown.message : "").toBe(
      "Invalid upload response",
    );
  });
});

describe("classifySubmitError", () => {
  it("surfaces upload-phase errors as an upload notice and history error", () => {
    const effect = classifySubmitError(
      new Error("File upload too large: notes.txt"),
      "upload",
    );

    expect(effect).toEqual({
      uploadNotice: {
        tone: "error",
        message: "File upload too large: notes.txt",
      },
      historyError: "File upload too large: notes.txt",
    });
  });

  it("falls back to a generic upload message for non-Error throwables", () => {
    const effect = classifySubmitError("boom", "upload");

    expect(effect.uploadNotice).toEqual({
      tone: "error",
      message: "Could not upload attachment.",
    });
    expect(effect.historyError).toBe("Could not upload attachment.");
  });

  it("flags send-phase errors as upload notices only when upload-related", () => {
    const effect = classifySubmitError(
      new Error("Unsupported file upload type: notes.bin"),
      "send",
    );

    expect(effect.uploadNotice).toEqual({
      tone: "error",
      message: "Unsupported file upload type: notes.bin",
    });
    expect(effect.historyError).toBe("Unsupported file upload type: notes.bin");
  });

  it("leaves the upload notice untouched for unrelated send errors", () => {
    const effect = classifySubmitError(new Error("Network down"), "send");

    expect(effect.uploadNotice).toBeNull();
    expect(effect.historyError).toBe("Network down");
  });

  it("falls back to a generic send message for non-Error throwables", () => {
    const effect = classifySubmitError(undefined, "send");

    expect(effect.uploadNotice).toBeNull();
    expect(effect.historyError).toBe("Could not send that message.");
  });
});
