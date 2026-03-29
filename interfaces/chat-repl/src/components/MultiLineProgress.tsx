/** @jsxImportSource react */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

interface MultiLineProgressProps {
  progressEvents: JobProgressEvent[];
  maxLines?: number;
}

export function MultiLineProgress({
  progressEvents,
  maxLines = 5,
}: MultiLineProgressProps): React.ReactElement {
  // Simplified event processing - just group by type and keep latest
  const { batchEvents, jobEvents } = useMemo(() => {
    const eventMap = new Map<string, JobProgressEvent>();

    // Keep only the latest event for each ID
    progressEvents.forEach((event) => {
      eventMap.set(event.id, event);
    });

    const events = Array.from(eventMap.values());
    const batchEvents = events.filter((e) => e.type === "batch");
    const jobEvents = events.filter((e) => e.type === "job");

    return { batchEvents, jobEvents };
  }, [progressEvents]);

  // Determine what to show based on available space
  const totalEvents = batchEvents.length + jobEvents.length;
  const linesToShow = Math.min(maxLines, totalEvents);

  // Prioritize: active batches first, then recent jobs
  const itemsToShow: JobProgressEvent[] = [];

  // Add batch events first (up to available lines)
  const batchesToShow = batchEvents.slice(0, linesToShow);
  itemsToShow.push(...batchesToShow);

  // Fill remaining space with jobs
  const remainingLines = linesToShow - batchesToShow.length;
  if (remainingLines > 0) {
    const jobsToShow = jobEvents.slice(0, remainingLines);
    itemsToShow.push(...jobsToShow);
  }

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
      {itemsToShow.map((event) => {
        if (event.type === "batch") {
          return (
            <Box
              key={`batch-${event.id}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Box justifyContent="space-between">
                <Box>
                  <Text bold color="cyan">
                    ▶ {event.metadata.operationType}
                    {event.metadata.operationTarget
                      ? `: ${event.metadata.operationTarget}`
                      : ""}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray" dimColor>
                    {event.batchDetails?.completedOperations}/
                    {event.batchDetails?.totalOperations} ops
                  </Text>
                  {event.progress && (
                    <>
                      <Text color="gray"> • </Text>
                      <Text color="green">{event.progress.percentage}%</Text>
                    </>
                  )}
                </Box>
              </Box>
              {event.batchDetails && event.batchDetails.totalOperations > 0 && (
                <Box marginLeft={2}>
                  <ProgressBar
                    current={event.batchDetails.completedOperations}
                    total={event.batchDetails.totalOperations}
                    width={40}
                    color="cyan"
                    showPercentage={true}
                    showCounts={false}
                  />
                </Box>
              )}
            </Box>
          );
        } else {
          return (
            <Box
              key={`job-${event.id}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Box justifyContent="space-between">
                <Box>
                  <Text color="blue">
                    • {event.metadata.operationType}
                    {event.metadata.operationTarget
                      ? `: ${event.metadata.operationTarget}`
                      : ""}
                  </Text>
                </Box>
                <Box>
                  {event.progress && (
                    <>
                      <Text color="gray">
                        {event.progress.current}/{event.progress.total}
                      </Text>
                      <Text color="gray"> • </Text>
                      <Text color="green">{event.progress.percentage}%</Text>
                    </>
                  )}
                </Box>
              </Box>
              {event.progress && event.progress.total > 0 && (
                <Box marginLeft={2}>
                  <ProgressBar
                    current={event.progress.current}
                    total={event.progress.total}
                    width={40}
                    color="blue"
                    showPercentage={true}
                    showCounts={false}
                  />
                </Box>
              )}
            </Box>
          );
        }
      })}
      {totalEvents > maxLines && (
        <Text color="gray" dimColor>
          ...and {totalEvents - maxLines} more
        </Text>
      )}
    </Box>
  );
}
