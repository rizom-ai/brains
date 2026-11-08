import { CHAT_API_VERSION } from "@rizom/brain/chat";
import { createConsumerChatClient, messageRequest } from "./src/index";
import { roundTrip } from "./src/round-trip";

const client = createConsumerChatClient(async (input) => {
  if (String(input) !== "/api/chat/sessions") {
    throw new Error(`Unexpected Chat request: ${String(input)}`);
  }
  return Response.json({
    sessions: [
      {
        id: "fixture-session",
        title: "Fixture session",
        lastActiveAt: "2026-09-02T00:00:00.000Z",
      },
    ],
  });
});

const sessions = await client.listSessions();
if (
  messageRequest.id !== "fixture-session" ||
  sessions[0]?.id !== "fixture-session"
) {
  throw new Error("Public Chat contract did not round-trip");
}

// Every method a client has, each answered as a brain's Chat API answers it.
const trip = await roundTrip();
const expected = [
  `v${CHAT_API_VERSION}`,
  "streamed 1",
  "guest true",
  "sessions 1",
  "history 1 1",
  "renamed Renamed",
  "archived true",
  "deleted true",
  "job completed",
  "context session-2",
  "action Done",
  "upload true",
  "links /api/chat/uploads?id=upload-1b4e28ba-2fa1-41d2-883f-0016d3cca427 /api/chat/attachments/document?id=doc-1&download=1 /api/chat/attachments/image?id=image-1",
  "missing http",
  "progress processing tool tool-completed",
];
if (JSON.stringify(trip) !== JSON.stringify(expected)) {
  throw new Error(
    `Public Chat client round trip differed: ${JSON.stringify(trip)}`,
  );
}

console.log(`public-chat-contract-ok-v${CHAT_API_VERSION}`);
