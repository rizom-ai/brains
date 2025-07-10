/** @jsxImportSource react */
import { useState, useCallback, useEffect, useMemo } from "react";
import React from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { MessageList, type Message } from "./MessageList";
import { EnhancedInput } from "./EnhancedInput";
import { StatusBarWithProgress } from "./StatusBarWithProgress";
import { CommandHistory } from "../features/history";
import type { CLIInterface } from "../cli-interface";
import type { JobProgressEvent } from "@brains/job-queue";

interface Props {
  interface: CLIInterface;
  registerProgressCallback: (
    callback: (events: JobProgressEvent[]) => void,
  ) => void;
  unregisterProgressCallback: () => void;
  registerResponseCallback: (callback: (response: string) => void) => void;
  registerErrorCallback: (callback: (error: Error) => void) => void;
  unregisterMessageCallbacks: () => void;
}

export default function App({
  interface: cliInterface,
  registerProgressCallback,
  unregisterProgressCallback,
  registerResponseCallback,
  registerErrorCallback,
  unregisterMessageCallbacks,
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
  const [progressEvents, setProgressEvents] = useState<JobProgressEvent[]>([]);
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Create command history instance
  const history = useMemo(() => new CommandHistory(), []);

  // Register callbacks for responses and errors
  useEffect(() => {
    const handleResponse = (response: string): void => {
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

    const handleError = (error: Error): void => {
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

    registerResponseCallback(handleResponse);
    registerErrorCallback(handleError);

    return (): void => {
      unregisterMessageCallbacks();
    };
  }, [
    registerResponseCallback,
    registerErrorCallback,
    unregisterMessageCallbacks,
  ]);

  // Create stable callback for progress updates
  const handleProgressUpdate = useCallback((events: JobProgressEvent[]) => {
    // Directly set the filtered array from CLI interface
    setProgressEvents(events);
  }, []);

  // Register the callback
  useEffect(() => {
    registerProgressCallback(handleProgressUpdate);

    return (): void => {
      unregisterProgressCallback();
    };
  }, [registerProgressCallback, unregisterProgressCallback, handleProgressUpdate]);

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
  // Reserve space for status bar (up to 4 lines for progress), input (2 lines), and margins (2 lines)
  const messageListHeight = Math.max(terminalHeight - 8, 10);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Message history with scrolling */}
      <Box flexGrow={1} height={messageListHeight} overflow="hidden">
        <MessageList messages={messages} height={messageListHeight} />
      </Box>

      {/* Input area above status bar */}
      <Box flexShrink={0} marginTop={1}>
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

      {/* Status bar at the bottom */}
      <Box flexShrink={0} marginTop={1}>
        <StatusBarWithProgress
          messageCount={messages.length}
          isConnected={isConnected}
          progressEvents={progressEvents}
        />
      </Box>
    </Box>
  );
}
