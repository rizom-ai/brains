import { CHAT_API_VERSION } from "@rizom/brain/chat";
import { createConsumerChatClient, messageRequest } from "./src/index";

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

console.log(`public-chat-contract-ok-v${CHAT_API_VERSION}`);
