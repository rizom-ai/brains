import type { ConfirmationGate, ToolResponse } from "@brains/mcp-service";
import { isPlainRecord } from "@brains/utils/predicates";
import { slugify } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import type { createInputSchema } from "./schemas";

type CreateToolInput = z.infer<typeof createInputSchema>;
type UploadsSource = Extract<CreateToolInput["source"], { kind: "uploads" }>;
export type UploadItemRequest = UploadsSource["items"][number];
export type UploadsCreateInput = CreateToolInput & { source: UploadsSource };

/** One file of a several-upload save, checked and named before anything is saved. */
export interface PreparedUploadItem {
  filename: string;
  entityType: string;
  title: string;
  /** The failed entity this save replaces, when it retries one. */
  replacesFailed?: string | undefined;
  /** Save the file; runs only once the user confirmed. */
  save(): Promise<ToolResponse>;
}

export type PreparedUploadResult =
  | { kind: "error"; result: ToolResponse }
  | { kind: "ok"; value: PreparedUploadItem };

function label(item: { entityType: string; title: string }): string {
  return `${item.entityType} "${item.title}"`;
}

function errorText(result: ToolResponse): string {
  return "error" in result ? result.error : "the save was not completed";
}

/** Every file that would land on the same entity as an earlier one. */
function findCollision(items: PreparedUploadItem[]): string | undefined {
  const seen = new Map<string, PreparedUploadItem>();
  for (const item of items) {
    const key = `${item.entityType}:${slugify(item.title)}`;
    const earlier = seen.get(key);
    if (earlier) {
      return `${earlier.filename} and ${item.filename} would both be saved as ${label(item)}. Give them different titles in source.items.`;
    }
    seen.set(key, item);
  }
  return undefined;
}

function buildConfirmation(
  items: PreparedUploadItem[],
  visibility: CreateToolInput["visibility"],
): { summary: string; completionSummary: string; preview: string } {
  return {
    summary: `Save ${items.length} uploaded files?`,
    completionSummary: `Saved ${items.length} uploaded files: ${items.map(label).join(", ")}.`,
    preview: [
      ...items.map((item, index) =>
        [
          `${index + 1}. ${item.filename} → ${label(item)}`,
          ...(item.replacesFailed
            ? [`   Replaces failed ${item.replacesFailed}`]
            : []),
        ].join("\n"),
      ),
      `Visibility: ${visibility ?? "public"}`,
    ].join("\n"),
  };
}

/** Save each file in turn; a failed file does not stop the others. */
async function saveAll(items: PreparedUploadItem[]): Promise<ToolResponse> {
  const saved: Array<Record<string, unknown>> = [];
  const failed: string[] = [];
  for (const item of items) {
    const result = await item.save();
    if ("success" in result && result.success) {
      saved.push({
        filename: item.filename,
        entityType: item.entityType,
        title: item.title,
        ...(isPlainRecord(result.data) ? result.data : {}),
      });
    } else {
      failed.push(`${item.filename}: ${errorText(result)}`);
    }
  }
  if (failed.length > 0) {
    const savedText =
      saved.length > 0
        ? `Saved ${saved
            .map(
              (item) =>
                `${String(item["entityType"])} "${String(item["title"])}"`,
            )
            .join(", ")}. `
        : "";
    return {
      success: false,
      error: `${savedText}Could not save ${failed.join("; ")}.`,
    };
  }
  return {
    success: true,
    data: {
      status: saved.some((item) => item["status"] === "generating")
        ? "generating"
        : "created",
      items: saved,
    },
  };
}

/**
 * Save several uploads from one request under a single confirmation. Each
 * file is checked and named exactly as a single upload would be; the
 * confirmation lists every file and freezes each one's title.
 */
export async function createFromUploads(params: {
  input: UploadsCreateInput;
  gate: ConfirmationGate;
  prepare(item: UploadItemRequest): Promise<PreparedUploadResult>;
}): Promise<ToolResponse> {
  const { input, gate } = params;
  if (input.title !== undefined) {
    return {
      success: false,
      error:
        "Several uploads take their titles from source.items, not a shared title.",
    };
  }

  const items: PreparedUploadItem[] = [];
  for (const [index, request] of input.source.items.entries()) {
    const prepared = await params.prepare(request);
    if (prepared.kind === "error") {
      return {
        success: false,
        error: `Upload ${index + 1} of ${input.source.items.length} (${request.upload.id}): ${errorText(prepared.result)}`,
      };
    }
    items.push(prepared.value);
  }
  const collision = findCollision(items);
  if (collision) return { success: false, error: collision };

  if (input.confirmed) {
    const gateError = gate.validateConfirmed(input.confirmationToken, input);
    if (gateError) return gateError;
    return saveAll(items);
  }

  const confirmation = buildConfirmation(items, input.visibility);
  const args = gate.buildArgs((confirmationToken) => ({
    entityType: input.entityType,
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    source: {
      kind: "uploads" as const,
      items: input.source.items.map((request, index) => ({
        upload: request.upload,
        transform: request.transform,
        title: items[index]?.title ?? request.title,
      })),
    },
    ...(input.replace ? { replace: input.replace } : {}),
    confirmed: true as const,
    confirmationToken,
  }));
  return {
    needsConfirmation: true,
    toolName: "system_create",
    summary: confirmation.summary,
    completionSummary: confirmation.completionSummary,
    preview: confirmation.preview,
    args,
  };
}
