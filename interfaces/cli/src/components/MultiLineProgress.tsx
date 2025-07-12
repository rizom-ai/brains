/** @jsxImportSource react */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

interface MultiLineProgressProps {
  progressEvents: JobProgressEvent[];
  maxLines?: number;
}

interface AggregatedProgress {
  operation: string;
  current: number;
  total: number;
  startTime: number | undefined;
  isDirectory?: boolean;
  fileCount?: number;
}

// Track start times for jobs
const jobStartTimes = new Map<string, number>();

function aggregateDirectoryOperations(
  events: JobProgressEvent[],
): Map<string, AggregatedProgress> {
  const aggregated = new Map<string, AggregatedProgress>();

  events.forEach((event) => {
    // Track start time for new jobs
    if (!jobStartTimes.has(event.id)) {
      jobStartTimes.set(event.id, Date.now());
    }

    // Check if this is a directory sync operation
    const isDirectoryOperation = event.operationType === "directory_import" || 
                                event.operationType === "directory_export" || 
                                event.operationType === "directory_sync";
    if (isDirectoryOperation && event.operationTarget) {
      const dirPath = event.operationTarget.substring(0, event.operationTarget.lastIndexOf("/")) || event.operationTarget;
      const key = `${event.operationType}:${dirPath}`;

      const existing = aggregated.get(key);
      if (existing) {
        existing.current = Math.max(
          existing.current,
          event.progress?.current ?? 0,
        );
        existing.fileCount = (existing.fileCount ?? 0) + 1;
      } else {
        aggregated.set(key, {
          operation: `${event.operationType} ${dirPath}`,
          current: event.progress?.current ?? 0,
          total: event.progress?.total ?? 0,
          startTime: jobStartTimes.get(event.id),
          isDirectory: true,
          fileCount: 1,
        });
      }
    } else {
      // Non-directory operation, add as-is
      aggregated.set(event.id, {
        operation: event.operationType + (event.operationTarget ? `: ${event.operationTarget}` : ""),
        current: event.progress?.current ?? 0,
        total: event.progress?.total ?? 0,
        startTime: jobStartTimes.get(event.id),
      });
    }
  });

  // Clean up start times for completed jobs
  const activeJobIds = new Set(events.map((e) => e.id));
  for (const [jobId] of jobStartTimes) {
    if (!activeJobIds.has(jobId)) {
      jobStartTimes.delete(jobId);
    }
  }

  return aggregated;
}

export function MultiLineProgress({
  progressEvents,
  maxLines = 5,
}: MultiLineProgressProps): React.ReactElement {
  // Separate batch and job events
  const batchEvents = progressEvents.filter((e) => e.type === "batch");
  const jobEvents = progressEvents.filter((e) => e.type === "job");

  // Aggregate directory operations
  const aggregatedJobs = useMemo(
    () => aggregateDirectoryOperations(jobEvents),
    [jobEvents],
  );

  // Convert aggregated back to array for display
  const displayJobs = Array.from(aggregatedJobs.values());

  // Determine what to show based on available space
  const linesToShow = Math.min(
    maxLines,
    batchEvents.length + displayJobs.length,
  );

  // Prioritize: active batches first, then recent jobs
  const itemsToShow: Array<{
    type: "batch" | "job";
    data: JobProgressEvent | AggregatedProgress;
  }> = [];

  // Add batch events first
  batchEvents.slice(0, linesToShow).forEach((batch) => {
    itemsToShow.push({ type: "batch", data: batch });
  });

  // Fill remaining space with jobs
  const remainingLines = linesToShow - itemsToShow.length;
  displayJobs.slice(0, remainingLines).forEach((job) => {
    itemsToShow.push({ type: "job", data: job });
  });

  if (itemsToShow.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="gray" dimColor>
          No active operations
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {itemsToShow.map((item, index) => {
        if (item.type === "batch" && "batchDetails" in item.data) {
          const batch = item.data as JobProgressEvent;
          // Track batch start time
          if (!jobStartTimes.has(batch.id)) {
            jobStartTimes.set(batch.id, Date.now());
          }

          // Use pre-calculated ETA/rate from progress reducer if available
          const eta = batch.progress?.etaFormatted ?? "calculating...";
          const rate = batch.progress?.rateFormatted ?? "...";

          return (
            <Box
              key={`batch-${batch.id}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Box justifyContent="space-between">
                <Box>
                  <Text bold color="cyan">
                    ▶ {batch.operationType}{batch.operationTarget ? `: ${batch.operationTarget}` : ""}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray" dimColor>
                    {batch.batchDetails?.completedOperations}/
                    {batch.batchDetails?.totalOperations} ops
                  </Text>
                  <Text color="gray"> • </Text>
                  <Text color="yellow">{rate} ops/s</Text>
                  <Text color="gray"> • </Text>
                  <Text color="green">ETA {eta}</Text>
                </Box>
              </Box>
              <Box marginLeft={2}>
                <ProgressBar
                  current={batch.batchDetails?.completedOperations ?? 0}
                  total={batch.batchDetails?.totalOperations ?? 0}
                  width={40}
                  color="cyan"
                  showPercentage={true}
                  showCounts={false}
                />
              </Box>
            </Box>
          );
        } else {
          const job = item.data as AggregatedProgress;
          // For aggregated operations, don't show ETA/rate since they combine multiple events
          const eta = "...";
          const rate = "...";

          return (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Box justifyContent="space-between">
                <Box>
                  <Text color="blue">
                    {job.isDirectory ? "📁" : "•"} {job.operation}
                    {job.fileCount && job.fileCount > 1 && (
                      <Text color="gray"> ({job.fileCount} files)</Text>
                    )}
                  </Text>
                </Box>
                <Box>
                  <Text color="yellow">{rate}/s</Text>
                  <Text color="gray"> • </Text>
                  <Text color="green">ETA {eta}</Text>
                </Box>
              </Box>
              <Box marginLeft={2}>
                <ProgressBar
                  current={job.current}
                  total={job.total}
                  width={40}
                  color="blue"
                  showPercentage={true}
                  showCounts={false}
                />
              </Box>
            </Box>
          );
        }
      })}
      {progressEvents.length > maxLines && (
        <Text color="gray" dimColor>
          ...and {progressEvents.length - maxLines} more
        </Text>
      )}
    </Box>
  );
}
