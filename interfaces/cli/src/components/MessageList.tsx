/** @jsxImportSource react */
import React from "react";
import { Box, Text, Spacer } from "ink";
import { CLIMarkdownRenderer } from "../renderer";
import type { JobProgressEvent } from "@brains/job-queue";
import { ProgressBar } from "./ProgressBar";

export interface Message {
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: Date;
  progress?: JobProgressEvent; // If this message represents progress
  messageId?: string; // Track message ID for updates
}

interface Props {
  messages: Message[];
  height?: number;
}

export function MessageList({ messages, height }: Props): React.ReactElement {
  const renderer = new CLIMarkdownRenderer();

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Box>
            <Text
              bold
              color={
                message.role === "user"
                  ? "blue"
                  : message.role === "assistant"
                    ? "green"
                    : message.role === "error"
                      ? "red"
                      : "gray"
              }
            >
              {message.role === "user"
                ? "You"
                : message.role === "assistant"
                  ? "Brain"
                  : message.role === "error"
                    ? "Error"
                    : "System"}
            </Text>
            <Text dimColor> • {message.timestamp.toLocaleTimeString()}</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            {message.progress ? (
              <Box flexDirection="column">
                {/* Progress title */}
                <Text>
                  {message.progress.status === "completed"
                    ? "✅"
                    : message.progress.status === "failed"
                      ? "❌"
                      : "🔄"}{" "}
                  {message.progress.metadata.operationType.replace(/_/g, " ")}
                  {message.progress.metadata.operationTarget &&
                    `: ${message.progress.metadata.operationTarget}`}
                </Text>

                {/* Progress bar */}
                {message.progress.progress && (
                  <ProgressBar
                    current={message.progress.progress.current}
                    total={message.progress.progress.total}
                    width={40}
                    color={
                      message.progress.status === "completed"
                        ? "green"
                        : message.progress.status === "failed"
                          ? "red"
                          : "yellow"
                    }
                  />
                )}

                {/* Additional info */}
                {message.progress.progress?.etaFormatted && (
                  <Text dimColor>
                    ETA: {message.progress.progress.etaFormatted}
                  </Text>
                )}
                {message.progress.progress?.rateFormatted && (
                  <Text dimColor>
                    Rate: {message.progress.progress.rateFormatted}
                  </Text>
                )}
              </Box>
            ) : (
              <Text>{renderer.render(message.content)}</Text>
            )}
          </Box>
        </Box>
      ))}
      <Spacer />
    </Box>
  );
}
