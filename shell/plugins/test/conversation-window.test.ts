import { expect, it } from "bun:test";
import type { Message } from "../src/contracts/conversations";
import { createConversationReader } from "../src/internal/callback-readers";

const messages: Message[] = Array.from({ length: 150 }, (_, index) => ({
  id: String(index + 1),
  conversationId: "conversation",
  role: "user",
  content: `Message ${index + 1}`,
  timestamp: "2026-01-01T00:00:00.000Z",
  metadata: {},
}));
const rejected = (promise: Promise<unknown>): Promise<unknown> =>
  promise.catch((error: unknown): unknown => error);

it("forwards a detached inclusive window, preserving tail reads and the narrow reader surface", async () => {
  const seen: unknown[] = [];
  const reader = createConversationReader({
    get: async () => null,
    getManyWithMessages: async () => [],
    getMessages: async (_id, options): Promise<Message[]> => {
      seen.push(options);
      return options?.range
        ? messages.slice(options.range.start - 1, options.range.end)
        : messages.slice(-(options?.limit ?? messages.length));
    },
  });
  const range = { start: 21, end: 51 };
  const work = reader.getMessages("conversation", { range });
  range.start = 90;
  expect((await work).map(({ id }) => id)).toEqual(
    messages.slice(20, 51).map(({ id }) => id),
  );
  expect(seen[0]).toEqual({ range: { start: 21, end: 51 } });
  expect(
    (await reader.getMessages("conversation", { limit: 2 })).map(
      ({ id }) => id,
    ),
  ).toEqual(["149", "150"]);
  expect(
    (
      await reader.getMessages("conversation", {
        range: { start: 1, end: 100 },
      })
    ).length,
  ).toBe(100);
  expect(Object.keys(reader).sort()).toEqual([
    "get",
    "getManyWithMessages",
    "getMessages",
  ]);
});

it.each([
  { start: 0, end: 1 },
  { start: -1, end: 1 },
  { start: 2, end: 1 },
  { start: 1, end: 101 },
  { start: 1.5, end: 2 },
  { start: 1, end: Infinity },
  { start: NaN, end: 2 },
  { start: 1, end: Number.MAX_SAFE_INTEGER + 1 },
])(
  "refuses an invalid or oversized window without querying (%j)",
  async (range) => {
    let calls = 0;
    const reader = createConversationReader({
      get: async () => null,
      getManyWithMessages: async () => [],
      getMessages: async (): Promise<Message[]> => {
        calls++;
        return [];
      },
    });
    expect(
      await rejected(reader.getMessages("conversation", { range })),
    ).toMatchObject({ code: "invalid_input" });
    expect(calls).toBe(0);
  },
);

it("rejects mixed range/limit, oversized host responses, and private host errors", async () => {
  let calls = 0;
  const reader = createConversationReader({
    get: async () => null,
    getManyWithMessages: async () => [],
    getMessages: async (): Promise<Message[]> => {
      calls++;
      return messages;
    },
  });
  const options = { range: { start: 1, end: 2 } };
  Object.defineProperty(options, "limit", { value: 1 });
  expect(
    await rejected(reader.getMessages("conversation", options)),
  ).toMatchObject({ code: "invalid_input" });
  expect(calls).toBe(0);
  expect(
    await rejected(
      reader.getMessages("conversation", { range: { start: 1, end: 2 } }),
    ),
  ).toMatchObject({ code: "invalid_response" });
  const failing = createConversationReader({
    get: async () => null,
    getManyWithMessages: async () => [],
    getMessages: async (): Promise<Message[]> => {
      throw new Error("Private conversation database details");
    },
  });
  const error = await rejected(
    failing.getMessages("conversation", { range: { start: 1, end: 2 } }),
  );
  expect(error).toMatchObject({
    code: "handler_failed",
    cause: { message: "Private conversation database details" },
  });
  expect(JSON.stringify(error)).not.toContain("Private");
});
