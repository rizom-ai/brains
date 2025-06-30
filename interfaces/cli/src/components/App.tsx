/** @jsxImportSource react */
import { useState, useCallback, useEffect, useMemo } from "react";
import React from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import type { MessageInterfacePlugin } from "@brains/plugin-utils";
import { MessageList, type Message } from "./MessageList";
import { EnhancedInput } from "./EnhancedInput";
import { StatusBar } from "./StatusBar";
import { CommandHistory } from "../features/history";

interface Props {
  interface: MessageInterfacePlugin;
}

export default function App({
  interface: cliInterface,
}: Props): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "Welcome to Brain CLI! Type /help for available commands.",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [currentContext, setCurrentContext] = useState("default");
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Create command history instance
  const history = useMemo(() => new CommandHistory(), []);

  // Listen for responses from the interface
  useEffect(() => {
    const handleResponse = (...args: unknown[]): void => {
      const response = args[0] as string;

      // Check for context switch
      if (response.startsWith("[Context switched to:")) {
        const match = response.match(/\[Context switched to: (.+)\]/);
        if (match?.[1]) {
          setCurrentContext(match[1]);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    };

    const handleError = (...args: unknown[]): void => {
      const error = args[0] as Error;
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: error.message,
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
      setIsConnected(false);
    };

    cliInterface.on("response", handleResponse);
    cliInterface.on("error", handleError);

    return (): void => {
      cliInterface.off("response", handleResponse);
      cliInterface.off("error", handleError);
    };
  }, [cliInterface]);

  const handleSubmit = useCallback(
    async (value: string): Promise<void> => {
      if (!value.trim()) return;

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: value,
          timestamp: new Date(),
        },
      ]);

      if (value === "/exit" || value === "/quit") {
        exit();
        return;
      }

      if (value === "/clear") {
        setMessages([
          {
            role: "system",
            content: "Screen cleared. Type /help for available commands.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      setIsLoading(true);
      setIsConnected(true);
      await cliInterface.processInput(value);
    },
    [cliInterface, exit],
  );

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
    if (key.ctrl && input === "l") {
      // Clear screen
      setMessages([
        {
          role: "system",
          content: "Screen cleared. Type /help for available commands.",
          timestamp: new Date(),
        },
      ]);
    }
  });

  // Calculate available height for message list
  const terminalHeight = stdout.rows || 24;
  const messageListHeight = Math.max(terminalHeight - 6, 10); // Reserve space for input and status

  return (
    <Box flexDirection="column" height="100%">
      {/* Message history with scrolling */}
      <MessageList messages={messages} height={messageListHeight} />

      {/* Status bar */}
      <Box marginBottom={1}>
        <StatusBar
          context={currentContext}
          messageCount={messages.length}
          isConnected={isConnected}
        />
      </Box>

      {/* Input area */}
      <Box>
        {isLoading ? (
          <Box>
            <Text color="green">
              <Spinner type="dots" />
            </Text>
            <Text color="gray"> Processing...</Text>
          </Box>
        ) : (
          <EnhancedInput
            onSubmit={handleSubmit}
            isLoading={isLoading}
            history={history}
          />
        )}
      </Box>
    </Box>
  );
}
