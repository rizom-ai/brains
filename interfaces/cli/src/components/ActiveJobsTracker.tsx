/** @jsxImportSource react */
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { BatchJobStatus } from "@brains/job-queue";
import type { Job } from "@brains/types";
import { BatchProgress } from "./BatchProgress";

interface ActiveJobsTrackerProps {
  // Function to fetch active jobs
  getActiveJobs: () => Promise<Job[]>;
  // Function to fetch active batches
  getActiveBatches: () => Promise<
    Array<{
      batchId: string;
      status: BatchJobStatus;
      metadata: unknown;
    }>
  >;
  // Update interval in milliseconds
  updateInterval?: number;
  // Whether to show individual jobs
  showJobs?: boolean;
}

export function ActiveJobsTracker({
  getActiveJobs,
  getActiveBatches,
  updateInterval = 1000,
  showJobs = false,
}: ActiveJobsTrackerProps): React.ReactElement {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [activeBatches, setActiveBatches] = useState<
    Array<{
      batchId: string;
      status: BatchJobStatus;
      metadata: unknown;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async (): Promise<void> => {
      try {
        const [jobs, batches] = await Promise.all([
          getActiveJobs(),
          getActiveBatches(),
        ]);

        if (isMounted) {
          setActiveJobs(jobs);
          setActiveBatches(batches);
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setIsLoading(false);
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

  if (isLoading) {
    return (
      <Box>
        <Text color="gray">Loading active operations...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  const hasActiveOperations = activeJobs.length > 0 || activeBatches.length > 0;

  if (!hasActiveOperations) {
    return (
      <Box>
        <Text color="gray">No active operations</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Active batches */}
      {activeBatches.length > 0 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">
              Active Batch Operations ({activeBatches.length})
            </Text>
          </Box>
          {activeBatches.map(({ batchId, status }) => (
            <BatchProgress key={batchId} batchStatus={status} />
          ))}
        </Box>
      )}

      {/* Active individual jobs */}
      {showJobs && activeJobs.length > 0 && (
        <Box flexDirection="column" marginTop={2}>
          <Box marginBottom={1}>
            <Text bold color="cyan">
              Active Jobs ({activeJobs.length})
            </Text>
          </Box>
          {activeJobs.map((job) => (
            <Box key={job.id} marginBottom={1}>
              <Text color="yellow">• </Text>
              <Text color="gray">
                {job.type} - {job.status}
              </Text>
              {job.data !== null && job.data !== undefined && (
                <Text color="gray">
                  {" "}
                  ({JSON.stringify(job.data).slice(0, 50)}...)
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}