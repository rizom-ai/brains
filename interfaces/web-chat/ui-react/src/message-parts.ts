import type { UIMessage } from "ai";
import { parseUploadPartData } from "./uploads";

function getPartData(part: unknown): unknown {
  if (!part || typeof part !== "object") return null;
  if (!("data" in part)) return null;
  return part.data;
}

type MessagePart = UIMessage["parts"][number];

export type RenderedPart =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: unknown[] }
  | { kind: "confirmation"; data: unknown }
  | { kind: "native-tool"; data: unknown }
  | { kind: "attachment"; data: unknown }
  | { kind: "sources"; data: unknown }
  | { kind: "progress"; data: unknown }
  | {
      kind: "file";
      filename: string;
      mediaType: string;
      url?: string | undefined;
      downloadUrl?: string | undefined;
    }
  | { kind: "generic"; type: string; data: unknown };

export function groupMessageParts(
  parts: readonly MessagePart[],
): RenderedPart[] {
  const out: RenderedPart[] = [];
  let toolRun: unknown[] = [];
  const flush = (): void => {
    if (toolRun.length === 0) return;
    out.push({ kind: "tools", tools: toolRun });
    toolRun = [];
  };
  for (const part of parts) {
    switch (part.type) {
      case "data-tool-result":
        toolRun.push(getPartData(part));
        continue;
      case "dynamic-tool":
        flush();
        out.push(
          part.state === "approval-requested"
            ? { kind: "confirmation", data: part }
            : { kind: "native-tool", data: part },
        );
        break;
      case "text":
        flush();
        out.push({ kind: "text", text: part.text });
        break;
      case "data-attachment":
        flush();
        out.push({ kind: "attachment", data: getPartData(part) });
        break;
      case "data-sources":
        flush();
        out.push({ kind: "sources", data: getPartData(part) });
        break;
      case "data-progress":
        flush();
        out.push({ kind: "progress", data: getPartData(part) });
        break;
      case "data-upload": {
        flush();
        const upload = parseUploadPartData(getPartData(part));
        if (upload) {
          out.push({
            kind: "file",
            filename: upload.filename,
            mediaType: upload.mediaType,
            ...(upload.url !== undefined && { url: upload.url }),
            ...(upload.downloadUrl !== undefined && {
              downloadUrl: upload.downloadUrl,
            }),
          });
        }
        break;
      }
      case "file":
        flush();
        out.push({
          kind: "file",
          filename: part.filename ?? "upload.txt",
          mediaType: part.mediaType,
        });
        break;
      default:
        flush();
        if (part.type.startsWith("data-")) {
          out.push({
            kind: "generic",
            type: part.type,
            data: getPartData(part),
          });
        }
        break;
    }
  }
  flush();
  return out;
}
