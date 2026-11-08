import {
  ChatApiError,
  DEFAULT_CHAT_API_PATH,
  archiveChatSessionResponseSchema,
  chatActionRequestSchema,
  chatActionResponseSchema,
  chatApprovalResponsePartSchema,
  chatApprovalResponseSchema,
  chatCardSchema,
  chatContextHandoffResponseSchema,
  chatEventActionSchema,
  chatFilePartSchema,
  chatHistoryAttachmentSchema,
  chatHistoryAttachmentSourceSchema,
  chatHistoryMessageSchema,
  chatJobStatusSchema,
  chatMessageSchema,
  chatMessagesResponseSchema,
  chatProgressEventSchema,
  chatProtocolEventSchema,
  chatSessionSchema,
  chatSessionsResponseSchema,
  chatTextPartSchema,
  chatToolStatusEventSchema,
  chatUploadPartSchema,
  chatUploadRefSchema,
  chatUploadResponseSchema,
  createChatApiPaths,
  createChatClient,
  deleteChatSessionResponseSchema,
  readChatProtocolEvents,
  renameChatSessionRequestSchema,
  renameChatSessionResponseSchema,
  type ArchiveChatSessionResponse,
  type ChatActionRequest,
  type ChatActionResponse,
  type ChatApiErrorKind,
  type ChatApiPaths,
  type ChatApprovalResponse,
  type ChatApprovalResponsePart,
  type ChatCard,
  type ChatClientOptions,
  type ChatContextHandoffRequest,
  type ChatContextHandoffResponse,
  type ChatEventAction,
  type ChatFetch,
  type ChatFilePart,
  type ChatHistoryAttachment,
  type ChatHistoryAttachmentSource,
  type ChatHistoryMessage,
  type ChatJobStatus,
  type ChatJobStatusValue,
  type ChatMessage,
  type ChatMessageRequest,
  type ChatMessageRole,
  type ChatMessagesResponse,
  type ChatProgressEvent,
  type ChatProtocolEvent,
  type ChatSession,
  type ChatSessionsResponse,
  type ChatTextPart,
  type ChatToolStatusEvent,
  type ChatToolStatusValue,
  type ChatUploadPart,
  type ChatUploadPartData,
  type ChatUploadRef,
  type ChatUploadResponse,
  type DeleteChatSessionResponse,
  type RenameChatSessionRequest,
  type RenameChatSessionResponse,
} from "@rizom/brain/chat";

const at = "2026-09-02T00:00:00.000Z";
const uploadId = "upload-1b4e28ba-2fa1-41d2-883f-0016d3cca427";

// Each answer the brain sends, written through its type and checked by its schema.
const upload: ChatUploadRef = chatUploadRefSchema.parse({
  kind: "upload",
  id: uploadId,
});
const source: ChatHistoryAttachmentSource =
  chatHistoryAttachmentSourceSchema.parse({ kind: "upload", id: uploadId });
const attachment: ChatHistoryAttachment = chatHistoryAttachmentSchema.parse({
  kind: "text",
  filename: "notes.md",
  mediaType: "text/markdown",
  sizeBytes: 12,
  createdAt: at,
  source,
});
const approvalCard: ChatCard = chatCardSchema.parse({
  kind: "tool-approval",
  id: "card-1",
  toolCallId: "call-1",
  toolName: "note_create",
  summary: "Create a note?",
  state: "approval-requested",
});
const role: ChatMessageRole = "assistant";
const historyMessage: ChatHistoryMessage = chatHistoryMessageSchema.parse({
  id: "message-1",
  role,
  content: "Hello",
  attachments: [attachment],
  cards: [approvalCard],
});
const session: ChatSession = chatSessionSchema.parse({
  id: "session-1",
  title: "Fixture session",
  lastActiveAt: at,
});
const sessions: ChatSessionsResponse = chatSessionsResponseSchema.parse({
  sessions: [session],
});
const messages: ChatMessagesResponse = chatMessagesResponseSchema.parse({
  messages: [historyMessage],
});
const renamed: RenameChatSessionResponse =
  renameChatSessionResponseSchema.parse({ renamed: true, title: "Renamed" });
const archived: ArchiveChatSessionResponse =
  archiveChatSessionResponseSchema.parse({ archived: true });
const deleted: DeleteChatSessionResponse =
  deleteChatSessionResponseSchema.parse({ deleted: true });
const jobState: ChatJobStatusValue = "completed";
const job: ChatJobStatus = chatJobStatusSchema.parse({
  id: "job-1",
  status: jobState,
});
const opened: ChatContextHandoffResponse =
  chatContextHandoffResponseSchema.parse({ conversationId: "session-2" });
const acted: ChatActionResponse = chatActionResponseSchema.parse({
  text: "Done",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  cards: [approvalCard],
});
const uploaded: ChatUploadResponse = chatUploadResponseSchema.parse({
  id: uploadId,
  ref: upload,
  filename: "notes.md",
  mediaType: "text/markdown",
  sizeBytes: 12,
  createdAt: at,
  url: `/api/chat/uploads?id=${uploadId}`,
  downloadUrl: `/api/chat/uploads?id=${uploadId}&download=1`,
});
const guestSession = {
  expiresAt: 1,
  provider: "fixture",
  notice: "Guest notice",
  deletionLimitations: "None",
  retention: { idleSeconds: 60, maxAgeSeconds: 3600 },
  messageCharacters: 2000,
  canSend: true,
};

// What a stream carries, read back from the protocol's own events.
const textEvent: ChatProtocolEvent = chatProtocolEventSchema.parse({
  type: "text-delta",
  id: "text-1",
  delta: "Hello",
});
const progress: ChatProgressEvent = chatProgressEventSchema.parse({
  type: "job",
  status: "processing",
  operationType: "data_processing",
});
const toolState: ChatToolStatusValue = "tool-completed";
const toolStatus: ChatToolStatusEvent = chatToolStatusEventSchema.parse({
  status: toolState,
  toolName: "note_create",
});

// What a client sends: each request part through its type and schema.
const text: ChatTextPart = chatTextPartSchema.parse({
  type: "text",
  text: "Hello",
});
const file: ChatFilePart = chatFilePartSchema.parse({
  type: "file",
  url: "data:text/plain;base64,SGVsbG8=",
});
const uploadData: ChatUploadPartData = { ref: upload };
const uploadPart: ChatUploadPart = chatUploadPartSchema.parse({
  type: "data-upload",
  data: uploadData,
});
const approval: ChatApprovalResponse = chatApprovalResponseSchema.parse({
  id: "approval-1",
  approved: true,
});
const approvalPart: ChatApprovalResponsePart =
  chatApprovalResponsePartSchema.parse({
    state: "approval-responded",
    approval,
  });
const message: ChatMessage = chatMessageSchema.parse({
  id: "message-2",
  role: "user",
  parts: [text, file, uploadPart, approvalPart],
});
const messageRequest: ChatMessageRequest = { messages: [message] };
const rename: RenameChatSessionRequest = renameChatSessionRequestSchema.parse({
  title: "Renamed",
});
const event: ChatEventAction = chatEventActionSchema.parse({
  type: "event",
  event: "continue",
});
const action: ChatActionRequest = chatActionRequestSchema.parse({
  conversationId: "session-1",
  action: event,
});
const handoff: ChatContextHandoffRequest = {
  version: 1,
  sourceId: "fixture-source",
  itemId: "fixture-item",
  titleSeed: "Discuss fixture item",
};

const paths: ChatApiPaths = createChatApiPaths(DEFAULT_CHAT_API_PATH);
const sessionPath = `${paths.sessions}?id=session-1`;

// A brain's Chat API, answering each path as the brain answers it.
const answers = new Map<string, unknown>([
  [`POST ${paths.stream}/session`, guestSession],
  [`GET ${paths.sessions}`, sessions],
  [`GET ${paths.messages}?id=session-1`, messages],
  [
    `GET ${paths.messages}?id=session-1&submissionId=submission-1`,
    { ...messages, submission: null },
  ],
  [`PUT ${sessionPath}`, renamed],
  [`PUT ${paths.sessionArchive}?id=session-1`, archived],
  [`DELETE ${sessionPath}`, deleted],
  [`GET ${paths.jobStatus}?id=job-1`, job],
  [`POST ${paths.contextSessions}`, opened],
  [`POST ${paths.actions}`, acted],
  [`POST ${paths.uploads}`, uploaded],
]);

const fetchChat: ChatFetch = async (input, init) => {
  const key = `${init?.method ?? "GET"} ${String(input)}`;
  if (key === `POST ${paths.stream}`) {
    return new Response(
      `data: ${JSON.stringify(textEvent)}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }
  if (!answers.has(key)) return new Response(null, { status: 404 });
  return Response.json(answers.get(key));
};

/** Call every method a Chat client has, against a brain's Chat API. */
export async function roundTrip(): Promise<readonly string[]> {
  const options: ChatClientOptions = { fetch: fetchChat };
  const client = createChatClient(options);
  const streamed: ChatProtocolEvent[] = [];
  for await (const received of readChatProtocolEvents(
    await client.streamMessages(messageRequest),
  )) {
    streamed.push(received);
  }
  const guest = await client.openGuestSession();
  const listed = await client.listSessions();
  const history = await client.getMessages("session-1");
  const guestHistory = await client.getGuestHistory(
    "session-1",
    "submission-1",
  );
  const title = (await client.renameSession("session-1", rename.title)).title;
  const archivedNow = (await client.archiveSession("session-1")).archived;
  const deletedNow = (await client.deleteSession("session-1")).deleted;
  const status = (await client.getJobStatus("job-1")).status;
  const conversation = (await client.openContextSession(handoff))
    .conversationId;
  const answered = (await client.runAction(action)).text;
  const stored = await client.upload(new Blob(["Hello"]), "notes.md");
  const missing = await client
    .getJobStatus("job-2")
    .then(() => "answered")
    .catch((error: unknown) => {
      const kind: ChatApiErrorKind | undefined =
        error instanceof ChatApiError ? error.kind : undefined;
      return kind ?? "unknown";
    });

  return [
    `v${client.version}`,
    `streamed ${streamed.length}`,
    `guest ${guest.canSend}`,
    `sessions ${listed.length}`,
    `history ${history.length} ${guestHistory.messages.length}`,
    `renamed ${title}`,
    `archived ${archivedNow}`,
    `deleted ${deletedNow}`,
    `job ${status}`,
    `context ${conversation}`,
    `action ${answered}`,
    `upload ${stored.ref.id === uploadId}`,
    `links ${client.getUploadUrl(uploadId)} ${client.getDocumentAttachmentUrl("doc-1", true)} ${client.getImageAttachmentUrl("image-1")}`,
    `missing ${missing}`,
    `progress ${progress.status} tool ${toolStatus.status}`,
  ];
}
