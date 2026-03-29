/** @jsxImportSource react */
import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { BatchJobStatus } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

interface BatchProgressProps {
  batchStatus: BatchJobStatus;
  showDetails?: boolean;
}

export function BatchProgress({
  batchStatus,
  showDetails = true,
}: BatchProgressProps): React.ReactElement {
  const {
    batchId,
    totalOperations,
    completedOperations,
    failedOperations,
    currentOperation,
    errors,
    status,
  } = batchStatus;

  const inProgress = status === "processing";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  // Calculate successful operations
  const successfulOperations = completedOperations - failedOperations;

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Batch Operation: {batchId.slice(0, 8)}...
        </Text>
      </Box>

      {/* Main progress bar */}
      <Box marginBottom={1}>
        <ProgressBar
          current={completedOperations}
          total={totalOperations}
          message="Overall Progress:"
          color={isFailed ? "red" : isCompleted ? "green" : "yellow"}
        />
      </Box>

      {/* Current operation */}
      {inProgress && currentOperation && (
        <Box marginBottom={1}>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> {currentOperation}</Text>
        </Box>
      )}

      {/* Details section */}
      {showDetails && (
        <Box flexDirection="column" marginLeft={2}>
          {/* Success count */}
          {successfulOperations > 0 && (
            <Box>
              <Text color="green">✓ </Text>
              <Text color="gray">{successfulOperations} successful</Text>
            </Box>
          )}

          {/* Failure count */}
          {failedOperations > 0 && (
            <Box>
              <Text color="red">✗ </Text>
              <Text color="gray">{failedOperations} failed</Text>
            </Box>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="red" bold>
                Errors:
              </Text>
              {errors.slice(0, 3).map((error, index) => (
                <Box key={index} marginLeft={2}>
                  <Text color="red">• </Text>
                  <Text color="gray">{error}</Text>
                </Box>
              ))}
              {errors.length > 3 && (
                <Box marginLeft={2}>
                  <Text color="gray">... and {errors.length - 3} more</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Final status */}
      {isCompleted && (
        <Box marginTop={1}>
          <Text color="green" bold>
            ✓ Batch completed successfully
          </Text>
        </Box>
      )}

      {isFailed && (
        <Box marginTop={1}>
          <Text color="red" bold>
            ✗ Batch failed
          </Text>
        </Box>
      )}
    </Box>
  );
}
