/** @jsxImportSource react */
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Job } from "@brains/types";
import type { BatchJobStatus } from "@brains/job-queue";
import type { JobProgressEvent } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";
import type { CLIInterface } from "../cli-interface";

interface StatusBarWithProgressProps {
  messageCount: number;
  isConnected: boolean;
  getActiveJobs: () => Promise<Job[]>;
  getActiveBatches: () => Promise<
    Array<{
      batchId: string;
      status: BatchJobStatus;
      metadata: unknown;
    }>
  >;
  updateInterval?: number;
  cliInterface?: CLIInterface;
}

export function StatusBarWithProgress({
  messageCount,
  isConnected,
  getActiveJobs,
  getActiveBatches,
  updateInterval = 500, // Faster updates for status bar
  cliInterface,
}: StatusBarWithProgressProps): React.ReactElement {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [activeBatches, setActiveBatches] = useState<
    Array<{
      batchId: string;
      status: BatchJobStatus;
    }>
  >([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [progressEvents, setProgressEvents] = useState<
    Map<string, JobProgressEvent>
  >(new Map());

  // Subscribe to job progress events from CLI interface
  useEffect(() => {
    if (!cliInterface) return;

    const handleJobProgress = (...args: unknown[]): void => {
      const progressEvent = args[0] as JobProgressEvent;

      setProgressEvents((prev) => {
        const updated = new Map(prev);

        // Update or add the progress event
        if (
          progressEvent.status === "completed" ||
          progressEvent.status === "failed"
        ) {
          // Remove completed/failed items after a short delay
          setTimeout(() => {
            setProgressEvents((p) => {
              const newMap = new Map(p);
              newMap.delete(progressEvent.id);
              return newMap;
            });
          }, 2000);
        }

        updated.set(progressEvent.id, progressEvent);
        return updated;
      });
    };

    cliInterface.on("job-progress", handleJobProgress);

    return (): void => {
      cliInterface.off("job-progress", handleJobProgress);
    };
  }, [cliInterface]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async (): Promise<void> => {
      if (isLoadingJobs) return; // Prevent overlapping fetches

      setIsLoadingJobs(true);
      try {
        const [jobs, batches] = await Promise.all([
          getActiveJobs().catch(() => []),
          getActiveBatches().catch(() => []),
        ]);

        if (isMounted) {
          setActiveJobs(jobs);
          setActiveBatches(batches);
        }
      } catch {
        // Silently handle errors in status bar
        if (isMounted) {
          setActiveJobs([]);
          setActiveBatches([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingJobs(false);
        }
      }
    };

    // Initial fetch
    void fetchData();

    // Set up interval for updates (slower if we have event subscriptions)
    const intervalId = setInterval(
      () => void fetchData(),
      cliInterface ? updateInterval * 2 : updateInterval,
    );

    return (): void => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [getActiveJobs, getActiveBatches, updateInterval, cliInterface]);

  // Merge progress events with batch data for real-time updates
  const enhancedBatches = activeBatches.map((batch) => {
    const progressEvent = progressEvents.get(batch.batchId);
    if (progressEvent?.type === "batch" && progressEvent.batchDetails) {
      // Use real-time progress data if available
      return {
        ...batch,
        status: {
          ...batch.status,
          completedOperations: progressEvent.batchDetails.completedOperations,
          currentOperation:
            progressEvent.batchDetails.currentOperation ??
            batch.status.currentOperation,
        },
      };
    }
    return batch;
  });

  // Calculate total active operations
  const totalActiveOps = activeJobs.length + activeBatches.length;
  const hasActiveOps = totalActiveOps > 0 || progressEvents.size > 0;

  // Get the most relevant batch for progress display
  const activeBatch =
    enhancedBatches.find((b) => b.status.status === "processing") ??
    enhancedBatches[0];

  // Check if we have any processing progress events
  const activeProgressEvent = Array.from(progressEvents.values()).find(
    (event) => event.status === "processing",
  );

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
          {hasActiveOps && activeBatch ? (
            <Box>
              <Text color="cyan">
                {activeBatch.status.currentOperation ?? "Processing..."}
              </Text>
              <Text color="gray"> </Text>
              <ProgressBar
                current={activeBatch.status.completedOperations}
                total={activeBatch.status.totalOperations}
                width={30}
                color="cyan"
                showPercentage={true}
                showCounts={false}
              />
            </Box>
          ) : activeProgressEvent &&
            activeProgressEvent.type === "job" &&
            activeProgressEvent.progress ? (
            <Box>
              <Text color="cyan">
                {activeProgressEvent.message ?? "Processing..."}
              </Text>
              <Text color="gray"> </Text>
              <ProgressBar
                current={activeProgressEvent.progress.current}
                total={activeProgressEvent.progress.total}
                width={30}
                color="cyan"
                showPercentage={true}
                showCounts={false}
              />
            </Box>
          ) : hasActiveOps ? (
            <Text color="cyan">
              {totalActiveOps} job{totalActiveOps !== 1 ? "s" : ""} active
            </Text>
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
