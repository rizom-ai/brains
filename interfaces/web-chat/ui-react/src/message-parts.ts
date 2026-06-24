import type { UIMessage } from "ai";
import { parseUploadPartData } from "./uploads";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPartData(part: unknown): unknown {
  if (!isRecord(part)) return null;
  if (!("data" in part)) return null;
  return part["data"];
}

function isCompletedNativeToolPart(part: RenderedPart): boolean {
  if (part.kind !== "native-tool") return false;
  if (!isRecord(part.data)) return false;
  const state = part.data["state"];
  return typeof state === "string" && state.startsWith("output-");
}

type MessagePart = UIMessage["parts"][number];

export type RenderedPart =
  | { kind: "text"; text: string }
  | { kind: "tools"; tools: unknown[] }
  | { kind: "confirmation"; data: unknown }
  | { kind: "native-tool"; data: unknown }
  | { kind: "attachment"; data: unknown }
  | { kind: "sources"; data: unknown }
  | { kind: "actions"; data: unknown }
  | { kind: "progress"; data: unknown }
  | {
      kind: "file";
      filename: string;
      mediaType: string;
      url?: string | undefined;
      downloadUrl?: string | undefined;
    }
  | { kind: "generic"; type: string; data: unknown };

export interface MessagePartSections {
  body: RenderedPart[];
  sources: RenderedPart[];
  actions: RenderedPart[];
  details: RenderedPart[];
}

function getMessagePartSection(part: RenderedPart): keyof MessagePartSections {
  switch (part.kind) {
    case "sources":
      return "sources";
    case "actions":
      return "actions";
    case "tools":
    case "generic":
      return "details";
    case "native-tool":
      return isCompletedNativeToolPart(part) ? "body" : "details";
    case "text":
    case "attachment":
    case "progress":
    case "confirmation":
    case "file":
      return "body";
  }
}

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
      case "data-actions":
        flush();
        out.push({ kind: "actions", data: getPartData(part) });
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

export function groupMessagePartSections(
  parts: readonly MessagePart[],
): MessagePartSections {
  const sections: MessagePartSections = {
    body: [],
    sources: [],
    actions: [],
    details: [],
  };
  for (const part of groupMessageParts(parts)) {
    sections[getMessagePartSection(part)].push(part);
  }
  return sections;
}
