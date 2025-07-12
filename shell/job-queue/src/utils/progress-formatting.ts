/**
 * Shared progress formatting utilities
 * Used by interfaces for consistent progress message formatting
 */

import type { JobProgressEvent } from "@brains/job-queue";
import {
  calculateETA,
  formatRate,
  formatDuration,
  type ProgressCalculation,
} from "./progress-calculations";

/**
 * Progress message template data
 */
export interface ProgressMessageData {
  operation: string;
  status: "processing" | "completed" | "failed";
  current?: number | undefined;
  total?: number | undefined;
  percentage?: number | undefined;
  calculation?: ProgressCalculation | undefined;
  duration?: number | undefined;
  error?: string | undefined;
}

/**
 * Generate progress message key for tracking updates
 */
export function generateProgressKey(
  event: JobProgressEvent,
  target: string,
): string {
  return `${event.type}:${event.id}:${target}`;
}

/**
 * Extract operation name from job event
 */
export function extractOperationName(event: JobProgressEvent): string {
  // Operation is required in JobProgressEvent schema
  return event.operation;
}

/**
 * Create progress message data from event
 */
export function createProgressMessageData(
  event: JobProgressEvent,
  startTime?: Date,
): ProgressMessageData {
  const operation = extractOperationName(event);
  const current = event.progress?.current;
  const total = event.progress?.total;

  let calculation: ProgressCalculation | undefined;
  let percentage: number | undefined;

  if (current !== undefined && total !== undefined && startTime) {
    calculation = calculateETA(current, total, startTime) || undefined;
    percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  }

  let duration: number | undefined;
  if (
    startTime &&
    (event.status === "completed" || event.status === "failed")
  ) {
    duration = (Date.now() - startTime.getTime()) / 1000;
  }

  return {
    operation,
    status: event.status as "processing" | "completed" | "failed",
    current,
    total,
    percentage,
    calculation,
    duration,
    error:
      event.message && event.status === "failed" ? event.message : undefined,
  };
}

/**
 * Format progress message for display
 */
export function formatProgressMessage(data: ProgressMessageData): string {
  const {
    operation,
    status,
    current,
    total,
    percentage,
    calculation,
    duration,
    error,
  } = data;

  switch (status) {
    case "processing": {
      let message = `🔄 ${operation}`;

      if (current !== undefined && total !== undefined) {
        message += ` - ${current}/${total}`;

        if (percentage !== undefined) {
          message += ` (${percentage}%)`;
        }

        if (calculation) {
          message += ` • ${formatRate(calculation.rate)} • ETA ${calculation.eta}`;
        }
      }

      return message;
    }

    case "completed": {
      let message = `✅ ${operation} completed`;

      if (current !== undefined && total !== undefined) {
        message += ` - ${total} items processed`;
      }

      if (duration !== undefined) {
        message += ` in ${formatDuration(duration)}`;
      }

      return message;
    }

    case "failed": {
      let message = `❌ ${operation} failed`;

      if (current !== undefined && total !== undefined) {
        message += ` - ${current}/${total} items processed`;
      }

      if (error) {
        message += ` - ${error}`;
      }

      return message;
    }

    default:
      return `⚙️ ${operation}`;
  }
}

/**
 * Format batch progress message
 */
export function formatBatchProgressMessage(
  event: JobProgressEvent,
  startTime?: Date,
): string {
  if (event.type !== "batch" || !event.batchDetails) {
    return formatProgressMessage(createProgressMessageData(event, startTime));
  }

  const { batchDetails } = event;
  const operation = extractOperationName(event);
  const completed = batchDetails.completedOperations;
  const total = batchDetails.totalOperations;

  switch (event.status) {
    case "processing": {
      let message = `🔄 ${operation} - ${completed}/${total} operations`;

      if (startTime) {
        const calculation = calculateETA(completed, total, startTime);
        if (calculation) {
          message += ` • ${formatRate(calculation.rate)} • ETA ${calculation.eta}`;
        }
      }

      return message;
    }

    case "completed": {
      let message = `✅ ${operation} completed - ${total} operations processed`;

      if (startTime) {
        const duration = (Date.now() - startTime.getTime()) / 1000;
        message += ` in ${formatDuration(duration)}`;
      }

      return message;
    }

    case "failed": {
      return `❌ ${operation} failed - ${completed}/${total} operations completed`;
    }

    default:
      return `⚙️ ${operation} - ${total} operations`;
  }
}

/**
 * Get emoji for operation status
 */
export function getStatusEmoji(status: JobProgressEvent["status"]): string {
  switch (status) {
    case "processing":
      return "🔄";
    case "completed":
      return "✅";
    case "failed":
      return "❌";
    case "pending":
      return "⏳";
    default:
      return "⚙️";
  }
}
