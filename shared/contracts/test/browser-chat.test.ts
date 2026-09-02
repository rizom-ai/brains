import { describe, expect, it } from "bun:test";
import {
  BROWSER_CHAT_API_VERSION,
  BrowserChatApiError,
  type BrowserChatFetch,
  browserChatContextHandoffRequestSchema,
  browserChatMessageRequestSchema,
  browserChatMessagesResponseSchema,
  browserChatProgressEventSchema,
  browserChatSessionSchema,
  browserChatToolStatusEventSchema,
  browserChatUploadResponseSchema,
  createBrowserChatApiPaths,
  createBrowserChatClient,
} from "../src/browser-chat";

describe("public browser Chat contract", () => {
  it("derives every supported path from one configurable API root", () => {
    const paths = createBrowserChatApiPaths("/custom/chat/");

    expect(BROWSER_CHAT_API_VERSION).toBe(1);
    expect(paths).toEqual({
      stream: "/custom/chat",
      actions: "/custom/chat/actions",
      sessions: "/custom/chat/sessions",
      sessionArchive: "/custom/chat/sessions/archive",
      messages: "/custom/chat/messages",
      uploads: "/custom/chat/uploads",
      documentAttachments: "/custom/chat/attachments/document",
      imageAttachments: "/custom/chat/attachments/image",
      jobStatus: "/custom/chat/jobs/status",
    });
    expect(() => createBrowserChatApiPaths("https://example.com/chat")).toThrow(
      "Browser Chat API path must be a same-origin absolute path",
    );
  });

  it("bounds public session and history payloads", () => {
    expect(
      browserChatSessionSchema.parse({
        id: "session-1",
        title: "Field notes",
        lastActiveAt: "2026-09-01T16:00:00.000Z",
      }),
    ).toEqual({
      id: "session-1",
      title: "Field notes",
      lastActiveAt: "2026-09-01T16:00:00.000Z",
    });
    expect(
      browserChatSessionSchema.safeParse({
        id: "session-1",
        title: "x".repeat(49),
        lastActiveAt: "not-a-date",
      }).success,
    ).toBe(false);
    expect(
      browserChatMessagesResponseSchema.safeParse({
        messages: [{ id: "m1", role: "system", content: "hidden" }],
      }).success,
    ).toBe(false);
    expect(
      browserChatUploadResponseSchema.safeParse({
        id: "upload-550e8400-e29b-41d4-a716-446655440000",
        ref: {
          kind: "upload",
          id: "upload-6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        },
        filename: "notes.md",
        mediaType: "text/markdown",
        sizeBytes: 7,
        createdAt: "2026-09-01T16:00:00.000Z",
        url: "https://attacker.example/upload",
        downloadUrl: "/api/chat/uploads?id=upload",
      }).success,
    ).toBe(false);
  });

  it("models message, approval, progress, and handoff domain data without view state", () => {
    expect(
      browserChatMessageRequestSchema.parse({
        id: "session-1",
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "approval-responded",
                toolCallId: "call-1",
                toolName: "delete_note",
                approval: { id: "approval-1", approved: true },
              },
            ],
          },
        ],
      }),
    ).toMatchObject({ id: "session-1" });
    expect(
      browserChatProgressEventSchema.parse({
        type: "job",
        status: "processing",
        operationType: "data_processing",
        progress: { current: 1, total: 2, percentage: 50 },
      }),
    ).toEqual({
      type: "job",
      status: "processing",
      operationType: "data_processing",
      progress: { current: 1, total: 2, percentage: 50 },
    });
    expect(
      browserChatToolStatusEventSchema.parse({
        status: "tool-awaiting-approval",
        toolName: "delete_note",
        message: "presentation-specific extra",
      }),
    ).toMatchObject({
      status: "tool-awaiting-approval",
      toolName: "delete_note",
    });
    expect(
      browserChatContextHandoffRequestSchema.safeParse({
        version: 1,
        sourceId: "unified-inbox",
        itemId: "item-1",
        titleSeed: "Discuss this item",
        route: "/studio/private-view",
      }).success,
    ).toBe(false);
  });

  it("uses the public schemas for headless client operations", async () => {
    const requests: Array<{
      url: string;
      method: string;
      body?: unknown;
    }> = [];
    const fetchFn: BrowserChatFetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({
        url,
        method,
        ...(typeof init?.body === "string"
          ? { body: JSON.parse(init.body) as unknown }
          : {}),
      });

      if (url === "/custom/chat/sessions" && method === "GET") {
        return Response.json({
          sessions: [
            {
              id: "session-1",
              title: "Field notes",
              lastActiveAt: "2026-09-01T16:00:00.000Z",
            },
          ],
        });
      }
      if (url === "/custom/chat/messages?id=session%2F1") {
        return Response.json({
          messages: [{ id: "m1", role: "assistant", content: "Hello" }],
        });
      }
      if (url === "/custom/chat/sessions?id=session%2F1" && method === "PUT") {
        return Response.json({ renamed: true, title: "Renamed" });
      }
      if (
        url === "/custom/chat/sessions/archive?id=session%2F1" &&
        method === "PUT"
      ) {
        return Response.json({ archived: true });
      }
      if (
        url === "/custom/chat/sessions?id=session%2F1" &&
        method === "DELETE"
      ) {
        return Response.json({ deleted: true });
      }
      if (url === "/custom/chat/jobs/status?id=job%2F1") {
        return Response.json({ id: "job/1", status: "completed" });
      }
      if (url === "/custom/chat/actions" && method === "POST") {
        return Response.json({
          text: "Advanced",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
      }
      if (url === "/custom/chat" && method === "POST") {
        return new Response('data: {"type":"finish"}\n\n', {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (url === "/custom/chat/uploads" && method === "POST") {
        return Response.json({
          id: "upload-550e8400-e29b-41d4-a716-446655440000",
          ref: {
            kind: "upload",
            id: "upload-550e8400-e29b-41d4-a716-446655440000",
          },
          filename: "notes.md",
          mediaType: "text/markdown",
          sizeBytes: 7,
          createdAt: "2026-09-01T16:00:00.000Z",
          url: "/custom/chat/uploads?id=upload-550e8400-e29b-41d4-a716-446655440000",
          downloadUrl:
            "/custom/chat/uploads?id=upload-550e8400-e29b-41d4-a716-446655440000&download=1",
        });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    };
    const client = createBrowserChatClient({
      apiPath: "/custom/chat",
      fetch: fetchFn,
    });

    expect(await client.listSessions()).toHaveLength(1);
    expect(await client.getMessages("session/1")).toEqual([
      { id: "m1", role: "assistant", content: "Hello" },
    ]);
    expect(await client.renameSession("session/1", "Renamed")).toEqual({
      renamed: true,
      title: "Renamed",
    });
    expect(await client.archiveSession("session/1")).toEqual({
      archived: true,
    });
    expect(await client.deleteSession("session/1")).toEqual({ deleted: true });
    expect(await client.getJobStatus("job/1")).toEqual({
      id: "job/1",
      status: "completed",
    });
    expect(
      await client.runAction({
        conversationId: "session/1",
        action: {
          type: "event",
          event: "advance",
        },
      }),
    ).toMatchObject({ text: "Advanced" });
    const stream = await client.streamMessages({
      id: "session/1",
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
    });
    expect(stream.headers.get("content-type")).toBe("text/event-stream");
    expect(
      await client.upload(
        new Blob(["# Notes"], { type: "text/markdown" }),
        "notes.md",
      ),
    ).toMatchObject({ filename: "notes.md", mediaType: "text/markdown" });
    expect(client.paths.stream).toBe("/custom/chat");
    expect(client.getDocumentAttachmentUrl("document/1", true)).toBe(
      "/custom/chat/attachments/document?id=document%2F1&download=1",
    );
    expect(client.getImageAttachmentUrl("image/1")).toBe(
      "/custom/chat/attachments/image?id=image%2F1",
    );
    expect(requests).toContainEqual({
      url: "/custom/chat/sessions?id=session%2F1",
      method: "PUT",
      body: { title: "Renamed" },
    });
    expect(requests).toContainEqual({
      url: "/custom/chat",
      method: "POST",
      body: {
        id: "session/1",
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
          },
        ],
      },
    });
  });

  it("reports bounded HTTP failures without exposing response bodies", async () => {
    const client = createBrowserChatClient({
      fetch: async () => new Response("private diagnostic", { status: 403 }),
    });

    try {
      await client.listSessions();
      throw new Error("Expected listSessions to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BrowserChatApiError);
      expect(error).toMatchObject({ status: 403, operation: "list sessions" });
      expect(String(error)).not.toContain("private diagnostic");
    }
  });
});
