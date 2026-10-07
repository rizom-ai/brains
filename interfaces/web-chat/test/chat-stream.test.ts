import { describe, expect, it, mock } from "bun:test";
import type {
  AttachmentCard,
  ResponseRenderDirective,
  ToolApprovalCard,
} from "@brains/plugins";
import { writeAnswer } from "../src/chat-stream";

/**
 * How an answer reads on an open connection.
 *
 * What a turn is made of, in what order, and what the caller may see is the
 * runtime's — it hands these directives over already decided. What is left
 * here is web-chat's own half: one frame per piece so the client can render
 * text as it lands and replace a tool row when the tool finishes.
 */

const leakedFooter =
  '\n\n[Entities affected this turn: anchor-profile "anchor-profile" (updated). Reference these IDs directly in follow-ups instead of searching for them.]';

function createWriter(): {
  writer: { write: ReturnType<typeof mock> };
  writes: unknown[];
} {
  const writes: unknown[] = [];
  const writer = {
    write: mock((part: unknown) => {
      writes.push(part);
    }),
  };
  return { writer, writes };
}

function partsOfType(writes: unknown[], type: string): unknown[] {
  return writes.filter(
    (write) =>
      typeof write === "object" &&
      write !== null &&
      "type" in write &&
      write.type === type,
  );
}

function textDeltas(writes: unknown[]): string[] {
  return partsOfType(writes, "text-delta").flatMap((write) =>
    typeof write === "object" &&
    write !== null &&
    "delta" in write &&
    typeof write.delta === "string"
      ? [write.delta]
      : [],
  );
}

function write(directives: ResponseRenderDirective[]): unknown[] {
  const { writer, writes } = createWriter();
  writeAnswer(writer, directives, (prefix: string) => `${prefix}-id`);
  return writes;
}

const attachmentCard: AttachmentCard = {
  kind: "attachment",
  id: "card-1",
  title: "Quarterly report",
  attachment: {
    mediaType: "application/pdf",
    url: "/api/chat/attachments/document?id=doc-1",
    filename: "report.pdf",
  },
};

const approvalCard: ToolApprovalCard = {
  kind: "tool-approval",
  id: "approval-1",
  toolCallId: "call-1",
  toolName: "publish",
  summary: "Publish the post",
  state: "approval-requested",
};

describe("an answer on the open stream", () => {
  it("does not carry the internal entity memory footer", () => {
    const writes = write([
      { kind: "text", text: `Saved your profile.${leakedFooter}` },
    ]);

    expect(textDeltas(writes)).toEqual(["Saved your profile."]);
  });

  it("writes each tool result as its own frame", () => {
    const writes = write([
      { kind: "text", text: "Here you go." },
      {
        kind: "tool-result",
        result: { toolName: "search", data: { hits: 2 } },
      },
      {
        kind: "tool-result",
        result: { toolName: "publish", jobId: "job-1" },
      },
    ]);

    expect(partsOfType(writes, "data-tool-result")).toEqual([
      {
        type: "data-tool-result",
        id: "tool-id",
        data: { toolName: "search", data: { hits: 2 } },
      },
      {
        type: "data-tool-result",
        id: "tool-id",
        data: { toolName: "publish", jobId: "job-1" },
      },
    ]);
  });

  it("writes an artifact the caller may have as an attachment frame", () => {
    const writes = write([
      { kind: "text", text: "Report ready." },
      { kind: "artifact", card: attachmentCard },
    ]);

    expect(partsOfType(writes, "data-attachment")).toHaveLength(1);
  });

  it("writes nothing at all for an artifact the caller may not have", () => {
    // Not even the card's metadata: the runtime marked this one denied, and a
    // filename is still something the caller was not meant to learn.
    const writes = write([
      { kind: "text", text: "Report ready." },
      { kind: "denied-artifact", card: attachmentCard },
    ]);

    expect(partsOfType(writes, "data-attachment")).toEqual([]);
    expect(partsOfType(writes, "tool-input-available")).toEqual([]);
  });

  it("writes a pending approval as a native tool approval request", () => {
    const writes = write([
      { kind: "text", text: "This needs your say-so." },
      {
        kind: "approvals",
        cards: [approvalCard],
        confirmations: [
          {
            id: "approval-1",
            toolName: "publish",
            summary: "Publish the post",
            args: {},
          },
        ],
      },
    ]);

    expect(partsOfType(writes, "tool-approval-request")).toEqual([
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "call-1",
      },
    ]);
  });
});
