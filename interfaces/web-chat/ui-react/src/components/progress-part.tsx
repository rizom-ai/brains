/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { z } from "@brains/utils/zod";

interface ProgressData {
  status: "pending" | "processing" | "completed" | "failed";
  operationType: string;
  operationTarget?: string;
  message?: string;
  progress?: { current: number; total: number; percentage: number };
}

const progressDataSchema = z.looseObject({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  operationType: z.string(),
});

export function isProgressData(data: unknown): data is ProgressData {
  return progressDataSchema.safeParse(data).success;
}

function formatOperationType(operationType: string): string {
  return operationType
    .split("_")
    .filter((part) => part.length > 0)
    .join(" ");
}

export function progressLabel(status: ProgressData["status"]): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
      return "queued";
    case "processing":
      return "processing";
  }
}

export function ProgressPart({
  data,
}: {
  data: unknown;
}): React.ReactElement | null {
  if (!isProgressData(data)) return null;
  const operation = formatOperationType(data.operationType);
  const title = data.operationTarget
    ? `${operation}: ${data.operationTarget}`
    : operation;
  const progress = data.progress;
  return (
    <section className="web-chat-progress-part" data-status={data.status}>
      <div className="web-chat-progress-kicker">
        {progressLabel(data.status)}
      </div>
      <div className="web-chat-progress-title">{title}</div>
      {data.message ? (
        <div className="web-chat-progress-message">{data.message}</div>
      ) : null}
      {progress ? (
        <div
          className="web-chat-progress-meter"
          aria-label={`${progress.percentage}% complete`}
        >
          <span
            style={
              {
                "--web-chat-progress-value": `${Math.max(0, Math.min(100, progress.percentage))}%`,
              } as CSSProperties
            }
          />
        </div>
      ) : null}
    </section>
  );
}
