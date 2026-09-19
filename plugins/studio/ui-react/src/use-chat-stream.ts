import { useCallback, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  readChatProtocolEvents,
  type ChatCard,
  type ChatClient,
  type ChatHistoryMessage,
  type ChatMessage,
  type ChatUploadResponse,
} from "@brains/contracts/chat";
import {
  approvalResponseMessage,
  createStudioChatStreamState,
  reduceStudioChatStream,
  streamAssistantMessage,
  type StudioChatApproval,
  type StudioChatStreamState,
} from "./chat-workspace-model";
import {
  studioChatDraftKey,
  type StudioChatDraftStore,
} from "./studio-chat-drafts";
import {
  studioChatKeys,
  type ChatSuggestedAction,
} from "./studio-chat-contracts";
import { errorMessage } from "./studio-chat-errors";

export interface InterruptedResponse {
  kind: "stopped" | "disconnected" | "failed";
  detail?: string;
  retry?: { text: string; uploads: ChatUploadResponse[] };
}

export interface ChatStreamInput {
  chatClient: Pick<ChatClient, "streamMessages" | "getMessages" | "runAction">;
  queryClient: QueryClient;
  sessionId: string | null;
  apiPath: string | undefined;
  draftStore: StudioChatDraftStore;
  draftKey: string;
  /** The draft key this render belongs to; a late reply against another is dropped. */
  currentDraftKey: RefObject<string>;
  mountedRef: RefObject<boolean>;
  /** Set when a first turn adopts its new conversation id, so the reset skips once. */
  adoptedSessionRef: RefObject<string | null>;
  uploads: ChatUploadResponse[];
  uploading: boolean;
  uploadAttemptCount: number;
  navigateToSession: (conversationId?: string, preserveWork?: boolean) => void;
}

export interface ChatStream {
  pendingMessages: ChatHistoryMessage[];
  stream: StudioChatStreamState | null;
  sending: boolean;
  error: string | null;
  interrupted: InterruptedResponse | null;
  /** Shared with the archive action, which parks the composer the same way. */
  setSending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPendingMessages: Dispatch<SetStateAction<ChatHistoryMessage[]>>;
  runStream: (
    conversationId: string,
    messages: ChatMessage[],
    onAccepted?: () => void,
    retry?: InterruptedResponse["retry"],
  ) => Promise<boolean>;
  submitPrompt: (prompt: string) => Promise<void>;
  respondToApproval: (
    approval: StudioChatApproval,
    approved: boolean,
  ) => Promise<void>;
  runSuggestedAction: (action: ChatSuggestedAction) => Promise<void>;
  /** Whether a turn is in flight, so the composer can offer to stop it. */
  hasActiveStream: () => boolean;
  /**
   * Stop the turn the reader is watching. The request stays the active one, so
   * it still reports itself as stopped and releases the composer on the way out.
   */
  stopActiveStream: () => void;
  /** Drop the in-flight turn entirely; nothing further is reported. */
  abortActiveStream: () => void;
  /** Abort and clear every value this hook owns, for a conversation change. */
  reset: () => void;
}

/**
 * Produces an assistant turn: the streamed response, the optimistic copy that
 * stands in until history is authoritative, and the record of a turn that did
 * not finish. The active request is a ref because every continuation compares
 * against it to decide whether it is still the turn in flight.
 */
export function useChatStream(input: ChatStreamInput): ChatStream {
  const {
    chatClient,
    queryClient,
    sessionId,
    apiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    adoptedSessionRef,
    uploads,
    uploading,
    uploadAttemptCount,
    navigateToSession,
  } = input;
  const [pendingMessages, setPendingMessages] = useState<ChatHistoryMessage[]>(
    [],
  );
  const [stream, setStream] = useState<StudioChatStreamState | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<InterruptedResponse | null>(
    null,
  );
  const activeStreamRef = useRef<AbortController | null>(null);

  const hasActiveStream = useCallback(
    (): boolean => activeStreamRef.current !== null,
    [],
  );

  const stopActiveStream = useCallback((): void => {
    activeStreamRef.current?.abort();
  }, []);

  const abortActiveStream = useCallback((): void => {
    const active = activeStreamRef.current;
    activeStreamRef.current = null;
    active?.abort();
  }, []);

  const reset = useCallback((): void => {
    abortActiveStream();
    setSending(false);
    setPendingMessages([]);
    setStream(null);
    setError(null);
    setInterrupted(null);
  }, [abortActiveStream]);

  const runStream = useCallback(
    async (
      conversationId: string,
      messages: ChatMessage[],
      onAccepted?: () => void,
      retry?: InterruptedResponse["retry"],
    ): Promise<boolean> => {
      activeStreamRef.current?.abort();
      const controller = new AbortController();
      activeStreamRef.current = controller;
      setSending(true);
      setError(null);
      setInterrupted(null);
      let stoppedByServer = false;
      let next: StudioChatStreamState = {
        ...createStudioChatStreamState(),
        messageId: crypto.randomUUID(),
      };
      setStream(next);
      let accepted = false;
      let retained = false;
      const retainResponse = (): void => {
        if (retained || (!next.text && next.cards.length === 0)) return;
        retained = true;
        const message = streamAssistantMessage(next);
        setPendingMessages((current) => [...current, message]);
        setStream({ ...next, text: "", cards: [] });
      };
      try {
        const response = await chatClient.streamMessages(
          {
            id: conversationId,
            messages,
            trigger: "submit-message",
          },
          { signal: controller.signal },
        );
        accepted = true;
        onAccepted?.();
        for await (const event of readChatProtocolEvents(response)) {
          if (activeStreamRef.current !== controller) return accepted;
          if (event.type === "abort") stoppedByServer = true;
          next = reduceStudioChatStream(next, event);
          setStream(next);
        }
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        if (
          controller.signal.aborted ||
          stoppedByServer ||
          next.error !== null ||
          !next.finished
        ) {
          setInterrupted({
            kind:
              controller.signal.aborted || stoppedByServer
                ? "stopped"
                : next.error !== null
                  ? "failed"
                  : "disconnected",
            ...(next.error ? { detail: next.error } : {}),
            ...(retry ? { retry } : {}),
          });
          return accepted;
        }
        try {
          const authoritativeMessages =
            await chatClient.getMessages(conversationId);
          if (activeStreamRef.current !== controller) return accepted;
          queryClient.setQueryData(
            studioChatKeys.messages(conversationId),
            authoritativeMessages,
          );
          setPendingMessages([]);
          // History now owns the completed turn, including its approvals.
          // Keep the live state only when this read fails.
          setStream(null);
        } catch {
          // The completed response remains visible from the optimistic state;
          // a later session visit can retry the authoritative history read.
        }
        await queryClient.invalidateQueries({
          queryKey: studioChatKeys.sessions,
        });
      } catch (cause) {
        if (activeStreamRef.current !== controller) return accepted;
        retainResponse();
        setInterrupted({
          kind: controller.signal.aborted
            ? "stopped"
            : accepted
              ? "disconnected"
              : "failed",
          ...(!controller.signal.aborted
            ? {
                detail: errorMessage(
                  cause,
                  "Chat could not complete the response",
                ),
              }
            : {}),
          ...(retry ? { retry } : {}),
        });
      } finally {
        if (activeStreamRef.current === controller) {
          activeStreamRef.current = null;
          setSending(false);
        }
      }
      return accepted;
    },
    [chatClient, queryClient],
  );

  const submitPrompt = useCallback(
    async (prompt: string): Promise<void> => {
      const text = prompt.trim();
      if (
        (!text && uploads.length === 0) ||
        sending ||
        uploading ||
        uploadAttemptCount > 0
      )
        return;
      const conversationId = sessionId ?? `web-${crypto.randomUUID()}`;
      const sentKey = studioChatDraftKey(apiPath, conversationId);
      const messageId = crypto.randomUUID();
      const uploadParts = uploads.map((upload) => ({
        type: "data-upload" as const,
        data: { ref: upload.ref },
      }));
      const parts = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...uploadParts,
      ];
      setPendingMessages((current) => [
        ...current,
        {
          id: messageId,
          role: "user",
          content: text,
          cards: uploads.map((upload): ChatCard => ({
            kind: "attachment",
            id: upload.id,
            title: upload.filename,
            attachment: {
              mediaType: upload.mediaType,
              filename: upload.filename,
              sizeBytes: upload.sizeBytes,
              url: upload.url,
              downloadUrl: upload.downloadUrl,
            },
          })),
        },
      ]);
      // The transcript owns the message from here, so the composer empties now
      // rather than when the server answers; a refusal puts the draft back. A
      // suggested action carries its own prompt and never empties the composer.
      const sentUploads = [...uploads];
      const held = draftStore.read(draftKey);
      const sentFromComposer = held.text === prompt;
      if (sentFromComposer || sentUploads.length > 0)
        draftStore.update(draftKey, {
          text: sentFromComposer ? "" : held.text,
          uploads: held.uploads.filter(
            (upload) => !sentUploads.some((sent) => sent.id === upload.id),
          ),
        });
      const accepted = await runStream(
        conversationId,
        [{ id: messageId, role: "user", parts }],
        () => {
          if (
            !sessionId &&
            mountedRef.current &&
            currentDraftKey.current === draftKey
          ) {
            draftStore.adopt(draftKey, sentKey);
            adoptedSessionRef.current = conversationId;
            navigateToSession(conversationId, true);
          }
        },
        { text: prompt, uploads: [...uploads] },
      );
      if (
        !accepted &&
        (currentDraftKey.current === sentKey ||
          (!sessionId && currentDraftKey.current === draftKey))
      ) {
        setPendingMessages((current) =>
          current.filter((message) => message.id !== messageId),
        );
        // Restore into whichever conversation the composer now shows, keeping
        // anything typed while the request was in flight.
        const key = currentDraftKey.current;
        const current = draftStore.read(key);
        draftStore.update(key, {
          ...(sentFromComposer && !current.text ? { text: prompt } : {}),
          uploads: [
            ...sentUploads.filter(
              (upload) =>
                !current.uploads.some((kept) => kept.id === upload.id),
            ),
            ...current.uploads,
          ],
        });
      }
    },
    [
      navigateToSession,
      sessionId,
      apiPath,
      draftStore,
      draftKey,
      currentDraftKey,
      mountedRef,
      adoptedSessionRef,
      runStream,
      sending,
      uploading,
      uploads,
      uploadAttemptCount,
    ],
  );

  const respondToApproval = useCallback(
    async (approval: StudioChatApproval, approved: boolean): Promise<void> => {
      if (!sessionId || sending) return;
      await runStream(sessionId, [approvalResponseMessage(approval, approved)]);
    },
    [sessionId, runStream, sending],
  );

  const runSuggestedAction = useCallback(
    async (action: ChatSuggestedAction): Promise<void> => {
      if (action.type === "prompt") {
        await submitPrompt(action.prompt);
        return;
      }
      if (!sessionId || sending) return;
      setSending(true);
      setError(null);
      try {
        const result = await chatClient.runAction({
          conversationId: sessionId,
          action: {
            type: "event",
            event: action.event,
            ...(action.fromState ? { fromState: action.fromState } : {}),
          },
        });
        if (!mountedRef.current || currentDraftKey.current !== draftKey) return;
        setPendingMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.text,
            ...(result.cards ? { cards: result.cards } : {}),
          },
        ]);
      } catch (cause) {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setError(errorMessage(cause, "Chat action failed"));
      } finally {
        if (mountedRef.current && currentDraftKey.current === draftKey)
          setSending(false);
      }
    },
    [
      chatClient,
      sessionId,
      sending,
      submitPrompt,
      draftKey,
      currentDraftKey,
      mountedRef,
    ],
  );

  return {
    pendingMessages,
    stream,
    sending,
    error,
    interrupted,
    setSending,
    setError,
    setPendingMessages,
    runStream,
    submitPrompt,
    respondToApproval,
    runSuggestedAction,
    hasActiveStream,
    stopActiveStream,
    abortActiveStream,
    reset,
  };
}
