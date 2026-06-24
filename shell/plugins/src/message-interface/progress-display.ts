import type { JobProgressEvent } from "@brains/job-queue";

export interface MessageProgressDisplay {
  title: string;
  label: string;
  amount?: string | undefined;
  message?: string | undefined;
  fallback: string;
}

export function formatMessageProgressDisplay(
  event: JobProgressEvent,
): MessageProgressDisplay {
  const title = getMessageProgressTitle(event.status);
  const label = formatMessageProgressLabel(event);
  const amount = formatMessageProgressAmount(event);
  const firstLine = amount
    ? `${title}: ${label} ${amount}`
    : `${title}: ${label}`;
  return {
    title,
    label,
    ...(amount ? { amount } : {}),
    ...(event.message ? { message: event.message } : {}),
    fallback: event.message ? `${firstLine}\n${event.message}` : firstLine,
  };
}

export function formatMessageProgressLabel(event: JobProgressEvent): string {
  const operationType = event.metadata.operationType.replace(/_/g, " ");
  return event.metadata.operationTarget
    ? `${operationType}: ${event.metadata.operationTarget}`
    : operationType;
}

export function formatMessageProgressAmount(
  event: JobProgressEvent,
): string | undefined {
  if (!event.progress || event.progress.total <= 0) return undefined;
  return `${event.progress.current}/${event.progress.total} (${event.progress.percentage}%)`;
}

export function getMessageProgressTitle(
  status: JobProgressEvent["status"],
): string {
  switch (status) {
    case "pending":
      return "Job queued";
    case "processing":
      return "Job processing";
    case "completed":
      return "Job completed";
    case "failed":
      return "Job failed";
  }
}
