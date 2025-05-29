import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { CLIInterface } from "../cli-interface.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface Props {
  interface: CLIInterface;
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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { exit } = useApp();

  // Listen for responses from the interface
  React.useEffect(() => {
    const handleResponse = (...args: unknown[]): void => {
      const response = args[0] as string;
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
          role: "system",
          content: `Error: ${error.message}`,
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
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

      setInput("");
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

      setIsLoading(true);
      await cliInterface.processInput(value);
    },
    [cliInterface, exit],
  );

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Message history */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message, index) => (
          <Box key={index} marginBottom={1}>
            <Text
              color={
                message.role === "user"
                  ? "blue"
                  : message.role === "assistant"
                    ? "green"
                    : "gray"
              }
            >
              {message.role === "user"
                ? "You"
                : message.role === "assistant"
                  ? "Brain"
                  : "System"}
              :{" "}
            </Text>
            <Text>{message.content}</Text>
          </Box>
        ))}
      </Box>

      {/* Input area */}
      <Box>
        <Text color="blue">› </Text>
        {isLoading ? (
          <Text>
            <Spinner type="dots" /> Processing...
          </Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={(value) => void handleSubmit(value)}
          />
        )}
      </Box>
    </Box>
  );
}
