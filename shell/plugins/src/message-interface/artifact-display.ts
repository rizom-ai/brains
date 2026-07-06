import { z } from "@brains/utils/zod";

export interface ArtifactDisplay {
  jobId?: string;
  title: string;
  description?: string;
  mediaType?: string;
  filename?: string;
  sizeLabel?: string;
  url?: string;
  downloadUrl?: string;
  previewUrl?: string;
}

export type ArtifactJobStatus =
  "pending" | "processing" | "completed" | "failed" | "unknown";

export interface ArtifactCardState {
  status: ArtifactJobStatus | "ready";
  label: string;
  isPending: boolean;
}

export function formatArtifactDisplay(data: unknown): ArtifactDisplay | null {
  const attachment = parseRecord(getRecordValue(data, "attachment"));
  if (!attachment) return null;

  const jobId = getStringValue(data, "jobId");
  const description = getStringValue(data, "description");
  const mediaType = getStringValue(attachment, "mediaType");
  const filename = getStringValue(attachment, "filename");
  const sizeLabel = formatByteSize(getNumberValue(attachment, "sizeBytes"));
  const url = getStringValue(attachment, "url");
  const downloadUrl = getStringValue(attachment, "downloadUrl");
  const previewUrl = getStringValue(attachment, "previewUrl");

  return {
    ...(jobId !== undefined ? { jobId } : {}),
    title: getStringValue(data, "title") ?? "Generated artifact",
    ...(description !== undefined ? { description } : {}),
    ...(mediaType !== undefined ? { mediaType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(sizeLabel !== undefined ? { sizeLabel } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(downloadUrl !== undefined ? { downloadUrl } : {}),
    ...(previewUrl !== undefined ? { previewUrl } : {}),
  };
}

export function formatByteSize(
  sizeBytes: number | undefined,
): string | undefined {
  if (sizeBytes === undefined) return undefined;
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return undefined;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = sizeBytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === "GB") {
      return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    }
    value /= 1024;
  }
  return undefined;
}

export function narrowArtifactJobStatus(
  status: string | undefined,
): ArtifactJobStatus {
  switch (status) {
    case "pending":
    case "processing":
    case "completed":
    case "failed":
      return status;
    default:
      return "unknown";
  }
}

export function artifactStatusLabel(status: ArtifactJobStatus | null): string {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "generating";
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "unknown":
      return "status unknown";
    default:
      return "ready";
  }
}

export function getArtifactCardState(
  jobStatus: ArtifactJobStatus | null,
): ArtifactCardState {
  return {
    status: jobStatus ?? "ready",
    label: artifactStatusLabel(jobStatus),
    isPending: jobStatus === "pending" || jobStatus === "processing",
  };
}

const recordSchema = z.record(z.string(), z.unknown());

function parseRecord(data: unknown): Record<string, unknown> | null {
  const parsed = recordSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function getRecordValue(data: unknown, key: string): unknown {
  return parseRecord(data)?.[key];
}

function getStringValue(data: unknown, key: string): string | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "string" ? value : undefined;
}

function getNumberValue(data: unknown, key: string): number | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "number" ? value : undefined;
}
