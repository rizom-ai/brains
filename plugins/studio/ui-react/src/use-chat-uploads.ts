import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import type { ChatClient, ChatUploadResponse } from "@brains/contracts/chat";
import type { ChatUploadAttempt } from "./studio-chat-contracts";
import { errorMessage } from "./studio-chat-errors";

export interface ChatUploadsInput {
  chatClient: Pick<ChatClient, "upload">;
  draftKey: string;
  /** A result for another conversation's draft is dropped rather than applied. */
  currentDraftKey: RefObject<string>;
  setUploads: (
    value:
      | ChatUploadResponse[]
      | ((current: ChatUploadResponse[]) => ChatUploadResponse[]),
  ) => void;
}

export interface ChatUploads {
  uploading: boolean;
  /** Files still in flight, and the ones that failed and are still on screen. */
  uploadAttempts: ChatUploadAttempt[];
  runUploads: (attempts: ChatUploadAttempt[]) => Promise<void>;
  uploadFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  dismissAttempt: (id: string) => void;
  /** Abandon the batch in flight and clear what it left behind. */
  reset: () => void;
}

/**
 * Uploads a batch of files into the composer's draft. One batch runs at a
 * time, tagged so that a result arriving after the batch was abandoned, or
 * after the reader moved to another conversation, is discarded rather than
 * attached to whatever is open now.
 */
export function useChatUploads(input: ChatUploadsInput): ChatUploads {
  const { chatClient, draftKey, currentDraftKey, setUploads } = input;
  const [uploading, setUploading] = useState(false);
  const [uploadAttempts, setUploadAttempts] = useState<ChatUploadAttempt[]>([]);
  const uploadBatchRef = useRef<symbol | null>(null);

  const runUploads = useCallback(
    async (attempts: ChatUploadAttempt[]): Promise<void> => {
      if (uploadBatchRef.current || attempts.length === 0) return;
      const batch = Symbol();
      uploadBatchRef.current = batch;
      setUploading(true);
      setUploadAttempts((current) => [
        ...current.filter(
          (item) => !attempts.some((attempt) => attempt.id === item.id),
        ),
        ...attempts.map((attempt): ChatUploadAttempt => ({
          id: attempt.id,
          file: attempt.file,
          status: "uploading",
        })),
      ]);
      await Promise.all(
        attempts.map(async (attempt): Promise<void> => {
          try {
            const upload = await chatClient.upload(
              attempt.file,
              attempt.file.name,
            );
            if (
              uploadBatchRef.current !== batch ||
              currentDraftKey.current !== draftKey
            )
              return;
            setUploads((current) => [...current, upload]);
            setUploadAttempts((current) =>
              current.filter((item) => item.id !== attempt.id),
            );
          } catch (cause) {
            if (
              uploadBatchRef.current !== batch ||
              currentDraftKey.current !== draftKey
            )
              return;
            setUploadAttempts((current) =>
              current.map((item) =>
                item.id === attempt.id
                  ? {
                      ...item,
                      status: "failed",
                      error: errorMessage(cause, "Upload failed"),
                    }
                  : item,
              ),
            );
          }
        }),
      );
      if (uploadBatchRef.current === batch) {
        uploadBatchRef.current = null;
        setUploading(false);
      }
    },
    [chatClient, draftKey, currentDraftKey, setUploads],
  );

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await runUploads(
        files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "uploading",
        })),
      );
    },
    [runUploads],
  );

  const dismissAttempt = useCallback((id: string): void => {
    setUploadAttempts((current) =>
      current.filter((attempt) => attempt.id !== id),
    );
  }, []);

  const reset = useCallback((): void => {
    uploadBatchRef.current = null;
    setUploading(false);
    setUploadAttempts([]);
  }, []);

  return {
    uploading,
    uploadAttempts,
    runUploads,
    uploadFiles,
    dismissAttempt,
    reset,
  };
}
