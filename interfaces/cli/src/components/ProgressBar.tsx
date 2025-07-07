/** @jsxImportSource react */
import React from "react";
import { Box, Text } from "ink";

interface ProgressBarProps {
  current: number;
  total: number;
  message?: string;
  width?: number;
  showPercentage?: boolean;
  showCounts?: boolean;
  barCompleteChar?: string;
  barIncompleteChar?: string;
  color?: string;
}

export function ProgressBar({
  current,
  total,
  message,
  width = 30,
  showPercentage = true,
  showCounts = true,
  barCompleteChar = "█",
  barIncompleteChar = "░",
  color = "green",
}: ProgressBarProps): React.ReactElement {
  // Calculate percentage
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  // Calculate filled width
  const filledWidth = Math.round((current / total) * width);
  const emptyWidth = width - filledWidth;

  // Create bar string
  const filledBar = barCompleteChar.repeat(Math.max(0, filledWidth));
  const emptyBar = barIncompleteChar.repeat(Math.max(0, emptyWidth));

  return (
    <Box>
      {message && (
        <Text color="gray">
          {message}
          {"  "}
        </Text>
      )}
      <Text color={color}>{filledBar}</Text>
      <Text color="gray">{emptyBar}</Text>
      {showCounts && (
        <Text color="gray">
          {"  "}
          {current}/{total}
        </Text>
      )}
      {showPercentage && (
        <Text color={percentage === 100 ? "green" : "yellow"}>
          {"  "}
          {percentage}%
        </Text>
      )}
    </Box>
  );
}
