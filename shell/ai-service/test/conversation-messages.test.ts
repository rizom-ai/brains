import { describe, expect, it } from "bun:test";
import { buildMessageWithAttachments } from "../src/conversation-messages";

describe("buildMessageWithAttachments", () => {
  it("includes model-visible upload refs for file attachments", () => {
    const content = buildMessageWithAttachments("save it as a document", [
      {
        kind: "file",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        data: new Uint8Array([1, 2, 3]),
        sizeBytes: 3,
        source: {
          kind: "web-chat-upload",
          id: "upload-00000000-0000-4000-8000-000000000401",
        },
      },
    ]);

    expect(content).toEqual([
      {
        type: "text",
        text: 'save it as a document\n\nAvailable runtime upload refs for attached files. To save, import, or promote one of these files, call system_create with upload: { kind: "web-chat-upload", id: <upload ID> }.\n- brief.pdf: upload { kind: "web-chat-upload", id: "upload-00000000-0000-4000-8000-000000000401" }',
      },
      {
        type: "file",
        data: new Uint8Array([1, 2, 3]),
        mediaType: "application/pdf",
        filename: "brief.pdf",
      },
    ]);
  });
});
