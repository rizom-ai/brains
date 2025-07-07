/** @jsxImportSource react */
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Job } from "@brains/types";
import type { BatchJobStatus } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

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
}

export function StatusBarWithProgress({
  messageCount,
  isConnected,
  getActiveJobs,
  getActiveBatches,
  updateInterval = 500, // Faster updates for status bar
}: StatusBarWithProgressProps): React.ReactElement {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [activeBatches, setActiveBatches] = useState<
    Array<{
      batchId: string;
      status: BatchJobStatus;
    }>
  >([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

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
          
          // Removed debug logging - too noisy
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

    // Set up interval for updates
    const intervalId = setInterval(() => void fetchData(), updateInterval);

    return (): void => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [getActiveJobs, getActiveBatches, updateInterval]);

  // Calculate total active operations
  const totalActiveOps = activeJobs.length + activeBatches.length;
  const hasActiveOps = totalActiveOps > 0;

  // Get the most relevant batch for progress display
  const activeBatch = activeBatches.find(
    (b) => b.status.status === "processing"
  ) ?? activeBatches[0];

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
          <Text color="gray">  │  </Text>
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