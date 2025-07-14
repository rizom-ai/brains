/** @jsxImportSource react */
import React, { useMemo } from "react";
import { Box, Text, Spacer, useStdout } from "ink";
import { CLIMarkdownRenderer } from "../renderer";

export interface Message {
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: Date;
  messageId?: string; // Track message ID for updates
}

interface Props {
  messages: Message[];
  height?: number;
  scrollOffset?: number; // 0 = bottom (newest), positive = scroll up
}

export function MessageList({
  messages,
  height,
  scrollOffset = 0,
}: Props): React.ReactElement {
  const renderer = new CLIMarkdownRenderer();
  const { stdout } = useStdout();

  // Calculate available height and implement smart scrolling
  const terminalHeight = stdout.rows || 24;
  const availableHeight = height ?? Math.max(terminalHeight - 4, 10); // Reserve space for input and status

  // Convert messages to lines and handle line-based scrolling
  const allLines = useMemo(() => {
    const lines: Array<{
      messageIndex: number;
      content: string;
      isHeader: boolean;
    }> = [];

    messages.forEach((message, msgIndex) => {
      // Add message header
      const role =
        message.role === "user"
          ? "You"
          : message.role === "assistant"
            ? "Brain"
            : message.role === "error"
              ? "Error"
              : "System";
      const timestamp = message.timestamp.toLocaleTimeString();
      lines.push({
        messageIndex: msgIndex,
        content: `${role} • ${timestamp}`,
        isHeader: true,
      });

      // Add message content lines
      const renderedContent = renderer.render(message.content);
      const contentLines = renderedContent
        .split("\n")
        .filter((line) => line.trim().length > 0);

      contentLines.forEach((line) => {
        lines.push({
          messageIndex: msgIndex,
          content: line,
          isHeader: false,
        });
      });

      // Add spacing between messages
      lines.push({
        messageIndex: msgIndex,
        content: "",
        isHeader: false,
      });
    });

    return lines;
  }, [messages, renderer]);

  // Calculate visible lines based on scroll offset
  const visibleLines = useMemo(() => {
    if (allLines.length === 0) return [];

    const maxLines = Math.max(1, availableHeight - 2); // Reserve space for scroll indicators
    const endIndex = allLines.length - scrollOffset;
    const startIndex = Math.max(0, endIndex - maxLines);

    return allLines.slice(startIndex, endIndex);
  }, [allLines, availableHeight, scrollOffset]);

  const hasOlderLines = scrollOffset + visibleLines.length < allLines.length;
  const hasNewerLines = scrollOffset > 0;

  return (
    <Box flexDirection="column" overflow="visible">
      {hasOlderLines && (
        <Box justifyContent="center">
          <Text dimColor italic>
            ↑ {allLines.length - (scrollOffset + visibleLines.length)} more
            lines (Shift+↑ or PgUp to scroll)
          </Text>
        </Box>
      )}
      {visibleLines.map((line, index) => {
        const message = messages[line.messageIndex];

        if (line.isHeader && message) {
          return (
            <Box key={index} marginBottom={0}>
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
                {line.content}
              </Text>
            </Box>
          );
        } else {
          return (
            <Box key={index} paddingLeft={line.content.trim() ? 2 : 0}>
              <Text>{line.content}</Text>
            </Box>
          );
        }
      })}
      {hasNewerLines && (
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor italic>
            ↓ {scrollOffset} more lines (Shift+↓ or PgDn to scroll)
          </Text>
        </Box>
      )}
      <Spacer />
    </Box>
  );
}
