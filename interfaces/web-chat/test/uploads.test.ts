import { describe, expect, it } from "bun:test";
import type { FileUIPart } from "ai";
import {
  createUploadPart,
  defaultUploadFilename,
  getFileUploadName,
  parseUploadPartData,
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
    ref: { kind: "web-chat-upload", id: "upload-123" },
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
