/** @jsxImportSource react */
import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { CommandHistory } from "../features/history";

interface Props {
  onSubmit: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  history: CommandHistory;
}

export function EnhancedInput({
  onSubmit,
  placeholder = "Type a message or /help for commands...",
  isLoading = false,
  history,
}: Props): React.ReactElement {
  const [value, setValue] = useState("");
  const [historyValue, setHistoryValue] = useState<string | undefined>();

  // Handle arrow keys for history navigation
  useInput((_input, key) => {
    if (isLoading) return;

    if (key.upArrow) {
      const prev = history.previous();
      if (prev !== undefined) {
        setValue(prev);
        setHistoryValue(prev);
      }
    } else if (key.downArrow) {
      const next = history.next();
      if (next !== undefined) {
        setValue(next);
        setHistoryValue(next);
      }
    }
  });

  const handleSubmit = useCallback(
    (inputValue: string) => {
      if (inputValue.trim()) {
        history.add(inputValue);
        onSubmit(inputValue);
        setValue("");
        setHistoryValue(undefined);
      }
    },
    [onSubmit, history],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      // Clear history navigation when user types
      if (historyValue !== undefined && newValue !== historyValue) {
        setHistoryValue(undefined);
      }
    },
    [historyValue],
  );

  if (isLoading) {
    return (
      <Box>
        <Text color="gray">Processing...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="green">
        ❯{" "}
      </Text>
      <TextInput
        value={value}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}
