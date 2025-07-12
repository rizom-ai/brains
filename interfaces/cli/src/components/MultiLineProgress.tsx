/** @jsxImportSource react */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import {
  progressReducer,
  createInitialProgressState,
  groupProgressEvents,
} from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

interface MultiLineProgressProps {
  progressEvents: JobProgressEvent[];
  maxLines?: number;
}

export function MultiLineProgress({
  progressEvents,
  maxLines = 5,
}: MultiLineProgressProps): React.ReactElement {
  // Use the shared progress reducer to process events
  const { processedEvents } = useMemo(() => {
    const state = createInitialProgressState();

    // Process all events through the reducer
    const finalState = progressEvents.reduce((currentState, event) => {
      return progressReducer(currentState, {
        type: "UPDATE_PROGRESS",
        event,
      });
    }, state);

    return {
      processedEvents: Array.from(finalState.events.values()),
    };
  }, [progressEvents]);

  // Group events using shared utility
  const { batchEvents, jobEvents } = useMemo(() => {
    const eventsMap = new Map();
    processedEvents.forEach((event) => eventsMap.set(event.id, event));
    return groupProgressEvents(eventsMap);
  }, [processedEvents]);

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
          // Use pre-calculated ETA/rate from progress reducer
          const eta = event.progress?.etaFormatted ?? "calculating...";
          const rate = event.progress?.rateFormatted ?? "...";

          return (
            <Box
              key={`batch-${event.id}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Box justifyContent="space-between">
                <Box>
                  <Text bold color="cyan">
                    ▶ {event.operationType}
                    {event.operationTarget ? `: ${event.operationTarget}` : ""}
                  </Text>
                </Box>
                <Box>
                  <Text color="gray" dimColor>
                    {event.batchDetails?.completedOperations}/
                    {event.batchDetails?.totalOperations} ops
                  </Text>
                  <Text color="gray"> • </Text>
                  <Text color="yellow">{rate}</Text>
                  <Text color="gray"> • </Text>
                  <Text color="green">ETA {eta}</Text>
                </Box>
              </Box>
              <Box marginLeft={2}>
                <ProgressBar
                  current={event.batchDetails?.completedOperations ?? 0}
                  total={event.batchDetails?.totalOperations ?? 0}
                  width={40}
                  color="cyan"
                  showPercentage={true}
                  showCounts={false}
                />
              </Box>
            </Box>
          );
        } else {
          // Individual job progress with reducer-calculated ETA/rate
          const eta = event.progress?.etaFormatted ?? "...";
          const rate = event.progress?.rateFormatted ?? "...";

          return (
            <Box
              key={`job-${event.id}`}
              flexDirection="column"
              marginBottom={1}
            >
              <Box justifyContent="space-between">
                <Box>
                  <Text color="blue">
                    • {event.operationType}
                    {event.operationTarget ? `: ${event.operationTarget}` : ""}
                  </Text>
                </Box>
                <Box>
                  <Text color="yellow">{rate}</Text>
                  <Text color="gray"> • </Text>
                  <Text color="green">ETA {eta}</Text>
                </Box>
              </Box>
              <Box marginLeft={2}>
                <ProgressBar
                  current={event.progress?.current ?? 0}
                  total={event.progress?.total ?? 0}
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
      {totalEvents > maxLines && (
        <Text color="gray" dimColor>
          ...and {totalEvents - maxLines} more
        </Text>
      )}
    </Box>
  );
}
