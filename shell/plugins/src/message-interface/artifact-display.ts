import { definedFields } from "@brains/utils/strip-undefined";
import {
  asRecord,
  readNumber,
  readString,
  readValue,
} from "@brains/utils/record-fields";

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
  const attachment = asRecord(readValue(data, "attachment"));
  if (!attachment) return null;

  const jobId = readString(data, "jobId");
  const description = readString(data, "description");
  const mediaType = readString(attachment, "mediaType");
  const filename = readString(attachment, "filename");
  const sizeLabel = formatByteSize(readNumber(attachment, "sizeBytes"));
  const url = readString(attachment, "url");
  const downloadUrl = readString(attachment, "downloadUrl");
  const previewUrl = readString(attachment, "previewUrl");

  return {
    ...definedFields({ jobId }),
    title: readString(data, "title") ?? "Generated artifact",
    ...definedFields({
      description,
      mediaType,
      filename,
      sizeLabel,
      url,
      downloadUrl,
      previewUrl,
    }),
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
