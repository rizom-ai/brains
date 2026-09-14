import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChatApiError,
  type ChatCard,
  type ChatClient,
} from "@brains/contracts/chat";
import {
  getArtifactCardState,
  narrowArtifactJobStatus,
} from "@brains/plugins/message-interface/artifact-display";
import { Button } from "@brains/app-ui-react";
import { chatClass, chatLayout } from "./studio-chat-layout.styles";

export function StudioChatAttachment(props: {
  card: Extract<ChatCard, { kind: "attachment" }>;
  client: ChatClient;
}): ReactElement {
  const { card, client } = props;
  const job = useQuery({
    queryKey: [
      "studio",
      "chat",
      "attachment-job",
      client.paths.jobStatus,
      card.jobId,
    ],
    queryFn: () => client.getJobStatus(card.jobId ?? ""),
    enabled: Boolean(card.jobId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ||
      query.state.data?.status === "processing"
        ? 2000
        : false,
  });
  const missingJob =
    job.error instanceof ChatApiError && job.error.status === 404;
  const statusUnavailable = job.isError && !missingJob;
  const state = getArtifactCardState(
    card.jobId ? narrowArtifactJobStatus(job.data?.status) : null,
  );
  // A missing historical job must not hide a durable file. Its own GET still
  // enforces access and the preview has an explicit loading-error fallback.
  const available =
    !card.jobId ||
    missingJob ||
    (!job.isError &&
      job.data !== undefined &&
      (state.status === "completed" || state.status === "unknown"));
  const previewUrl = card.attachment.previewUrl ?? card.attachment.url;
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const label = statusUnavailable
    ? "Status unavailable"
    : card.jobId && job.isPending
      ? "Checking generation status"
      : state.label;

  return (
    <section
      className={chatClass("studio-chat-card", chatLayout.card)}
      aria-label={card.title}
    >
      <span className={chatClass("studio-chat-card-kicker", chatLayout.kicker)}>
        Artifact
      </span>
      <strong>{card.title}</strong>
      <span
        role="status"
        className={chatClass(
          "studio-chat-card-description",
          chatLayout.cardText,
        )}
      >
        {label}
      </span>
      {card.description ? (
        <p
          className={chatClass(
            "studio-chat-card-description",
            chatLayout.cardText,
          )}
        >
          {card.description}
        </p>
      ) : null}
      {available && card.attachment.mediaType.startsWith("image/") ? (
        failedPreview === previewUrl ? (
          <p role="status">
            Image preview unavailable. You can still open or download the file.
          </p>
        ) : (
          <img
            className={chatClass(
              "studio-chat-attachment-preview",
              chatLayout.attachmentPreview,
            )}
            src={previewUrl}
            alt={card.title}
            loading="lazy"
            onError={() => setFailedPreview(previewUrl)}
          />
        )
      ) : null}
      {available ? (
        <div
          className={chatClass("studio-chat-card-actions", chatLayout.actions)}
        >
          <a
            className={chatClass("studio-chat-card-action", chatLayout.button)}
            href={card.attachment.url}
          >
            Open
          </a>
          <a
            className={chatClass("studio-chat-card-action", chatLayout.button)}
            href={card.attachment.downloadUrl ?? card.attachment.url}
            download={card.attachment.filename ?? true}
          >
            Download
          </a>
        </div>
      ) : null}
      {statusUnavailable ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void job.refetch()}
        >
          Check status
        </Button>
      ) : null}
    </section>
  );
}
