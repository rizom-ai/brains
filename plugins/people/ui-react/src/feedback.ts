import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface FeedbackEntry {
  message: string;
  tone: "good" | "error";
}

export type Feedback = FeedbackEntry | null;

export interface MutationFeedbackOptions {
  fallback: string;
  success?: string;
}

export interface MutationFeedbackController {
  feedback: Feedback;
  setFeedback: Dispatch<SetStateAction<Feedback>>;
  runWithFeedback<T>(
    operation: () => Promise<T>,
    options: MutationFeedbackOptions,
  ): Promise<T>;
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function runWithFeedback<T>(
  operation: () => Promise<T>,
  report: (feedback: FeedbackEntry) => void,
  options: MutationFeedbackOptions,
): Promise<T> {
  try {
    const result = await operation();
    if (options.success) {
      report({ message: options.success, tone: "good" });
    }
    return result;
  } catch (error) {
    report({
      message: messageOf(error, options.fallback),
      tone: "error",
    });
    throw error;
  }
}

export function useMutationFeedback(): MutationFeedbackController {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const executeWithFeedback = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options: MutationFeedbackOptions,
    ): Promise<T> => runWithFeedback(operation, setFeedback, options),
    [],
  );

  return {
    feedback,
    setFeedback,
    runWithFeedback: executeWithFeedback,
  };
}
