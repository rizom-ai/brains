/** @jsxImportSource react */
import React from "react";
import { Box, Text } from "ink";

interface Props {
  context?: string;
  messageCount: number;
  isConnected: boolean;
}

export function StatusBar({
  context = "default",
  messageCount,
  isConnected,
}: Props): React.ReactElement {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text>
        <Text color="cyan">Context:</Text> {context}
      </Text>
      <Text> │ </Text>
      <Text>
        <Text color="cyan">Messages:</Text> {messageCount}
      </Text>
      <Text> │ </Text>
      <Text>
        <Text color="cyan">Status:</Text>{" "}
        <Text color={isConnected ? "green" : "red"}>
          {isConnected ? "● Connected" : "○ Disconnected"}
        </Text>
      </Text>
    </Box>
  );
}
