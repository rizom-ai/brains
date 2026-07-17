import { createHmac } from "node:crypto";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat, type Adapter, type Logger } from "chat";

const signingSecret = "test-signing-secret";
const logger: Logger = {
  child: () => logger,
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

function createRequest(
  body: string,
  timestamp: string,
  signature: string,
): Request {
  return new Request("https://brain.test/api/webhooks/chat/slack", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": signature,
    },
    body,
  });
}

function sign(body: string, timestamp: string): string {
  return `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}

const slack = createSlackAdapter({
  botToken: "xoxb-test",
  botUserId: "U_BOT",
  signingSecret,
  logger,
});
// Chat SDK 4.33's SlackAdapter declares botUserId optional while Adapter
// declares it required. Runtime initialization resolves or accepts the value.
const app = new Chat({
  userName: "brain",
  adapters: { slack: slack as unknown as Adapter },
  logger,
  state: createMemoryState(),
});

try {
  const body = JSON.stringify({ type: "url_verification", challenge: "ok" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const invalid = await app.webhooks["slack"](
    createRequest(body, timestamp, "v0=invalid"),
  );
  const valid = await app.webhooks["slack"](
    createRequest(body, timestamp, sign(body, timestamp)),
  );
  console.log(
    JSON.stringify({
      invalidBody: await invalid.text(),
      invalidStatus: invalid.status,
      validBody: await valid.json(),
      validStatus: valid.status,
    }),
  );
} finally {
  await app.shutdown();
}
