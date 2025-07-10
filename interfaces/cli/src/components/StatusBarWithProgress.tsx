/** @jsxImportSource react */
import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import type { JobProgressEvent } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

interface StatusBarWithProgressProps {
  messageCount: number;
  isConnected: boolean;
  progressEvents: JobProgressEvent[];
}

export function StatusBarWithProgress({
  messageCount,
  isConnected,
  progressEvents,
}: StatusBarWithProgressProps): React.ReactElement {
  const MIN_DISPLAY_DURATION = 400; // 400ms minimum display

  // Track displayed events with timestamps
  const [displayedEvents, setDisplayedEvents] = useState<JobProgressEvent[]>(
    [],
  );
  const eventTimestamps = useRef<Map<string, number>>(new Map());
  const removalTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      removalTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      removalTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    const now = Date.now();

    // Build a map of current events for easy lookup
    const currentEventsMap = new Map(progressEvents.map((e) => [e.id, e]));

    // Track first appearance of events
    progressEvents.forEach((event) => {
      if (!eventTimestamps.current.has(event.id)) {
        eventTimestamps.current.set(event.id, now);
      }
    });

    // Update displayed events to match current events (for events still incoming)
    setDisplayedEvents((prev) => {
      const prevMap = new Map(prev.map((e) => [e.id, e]));
      const updatedEvents: JobProgressEvent[] = [];

      // Update or keep existing displayed events
      prev.forEach((displayedEvent) => {
        const currentEvent = currentEventsMap.get(displayedEvent.id);
        if (currentEvent) {
          // Event still exists, update it
          updatedEvents.push(currentEvent);
        } else if (!removalTimeouts.current.has(displayedEvent.id)) {
          // Event gone but not scheduled for removal, schedule it now
          const displayedFor =
            now - (eventTimestamps.current.get(displayedEvent.id) ?? now);
          const remainingTime = Math.max(
            0,
            MIN_DISPLAY_DURATION - displayedFor,
          );

          const timeout = setTimeout(() => {
            setDisplayedEvents((prev) =>
              prev.filter((e) => e.id !== displayedEvent.id),
            );
            eventTimestamps.current.delete(displayedEvent.id);
            removalTimeouts.current.delete(displayedEvent.id);
          }, remainingTime);

          removalTimeouts.current.set(displayedEvent.id, timeout);
          // Keep it displayed until timeout
          updatedEvents.push(displayedEvent);
        } else {
          // Already scheduled for removal, keep displaying
          updatedEvents.push(displayedEvent);
        }
      });

      // Add new events
      progressEvents.forEach((event) => {
        if (!prevMap.has(event.id)) {
          updatedEvents.push(event);
        }
      });

      return updatedEvents;
    });

    // Cleanup function
    return (): void => {
      // Don't clear timeouts here, they need to persist
    };
  }, [progressEvents]);

  // Get all batch and job progress events from displayed events
  const batchProgressEvents = displayedEvents.filter(
    (event) => event.type === "batch",
  );

  const jobProgressEvents = displayedEvents.filter(
    (event) => event.type === "job",
  );

  // For display, prioritize the first batch, then the first job
  const primaryEvent = batchProgressEvents[0] ?? jobProgressEvents[0];

  return (
    <Box width="100%">
      {/* Single line with status on left, progress on right */}
      <Box justifyContent="space-between" width="100%">
        {/* Left side - Status info */}
        <Box>
          <Box marginRight={1}>
            <Text color={isConnected ? "green" : "red"} bold>
              ●
            </Text>
          </Box>
          <Text color={isConnected ? "green" : "red"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Text>
          <Text color="gray"> │ </Text>
          <Text color="gray">Messages: </Text>
          <Text color="yellow">{messageCount}</Text>
        </Box>

        {/* Right side - Progress or Ready status */}
        <Box>
          {primaryEvent ? (
            <Box>
              <Text color="cyan">{primaryEvent.operation}</Text>
              <Text color="gray"> </Text>
              {primaryEvent.type === "batch" && primaryEvent.batchDetails ? (
                <ProgressBar
                  current={primaryEvent.batchDetails.completedOperations}
                  total={primaryEvent.batchDetails.totalOperations}
                  width={30}
                  color="cyan"
                  showPercentage={true}
                  showCounts={false}
                />
              ) : primaryEvent.progress ? (
                <ProgressBar
                  current={primaryEvent.progress.current}
                  total={primaryEvent.progress.total}
                  width={30}
                  color="cyan"
                  showPercentage={true}
                  showCounts={false}
                />
              ) : (
                <Text color="gray"> Active</Text>
              )}
            </Box>
          ) : (
            <Text color="gray" dimColor>
              Ready
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
