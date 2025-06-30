/** @jsxImportSource react */
import React from "react";
import { Box, Text, Spacer } from "ink";
import { CLIMarkdownRenderer } from "../renderer";

export interface Message {
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: Date;
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
          <Box paddingLeft={2}>
            <Text>{renderer.render(message.content)}</Text>
          </Box>
        </Box>
      ))}
      <Spacer />
    </Box>
  );
}
