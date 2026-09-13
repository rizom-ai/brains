import { expect, test } from "bun:test";
import {
  StudioChatDraftStore,
  studioChatDraftKey,
  shouldBlockChatNavigation,
} from "./studio-chat-drafts";

test("session changes keep drafts, while leaving or interrupting work requires review", () => {
  expect(
    shouldBlockChatNavigation({ hasDraft: true, busy: false }, "/chat"),
  ).toBe(false);
  expect(
    shouldBlockChatNavigation({ hasDraft: true, busy: false }, "/studio"),
  ).toBe(true);
  expect(
    shouldBlockChatNavigation({ hasDraft: false, busy: true }, "/chat"),
  ).toBe(true);
  expect(
    shouldBlockChatNavigation({ hasDraft: false, busy: false }, "/studio"),
  ).toBe(false);
});

test("drafts are isolated by session, endpoint, and mounted Studio", () => {
  const store = new StudioChatDraftStore();
  const a = studioChatDraftKey("/api/chat", "one");
  expect(store.hasDrafts()).toBe(false);
  store.update(a, { text: "Private unfinished message" });
  expect(store.read(a).text).toBe("Private unfinished message");
  expect(store.read(studioChatDraftKey("/api/chat", "two")).text).toBe("");
  expect(store.read(studioChatDraftKey("/other/chat", "one")).text).toBe("");
  expect(new StudioChatDraftStore().read(a).text).toBe("");
  expect(store.hasDrafts()).toBe(true);
  expect(
    shouldBlockChatNavigation(
      { hasDraft: store.hasDrafts(), busy: false },
      "/studio",
    ),
  ).toBe(true);
  store.update(a, { text: "" });
  expect(store.hasDrafts()).toBe(false);
});

test("a handoff never overwrites an existing conversation's draft", () => {
  const store = new StudioChatDraftStore();
  store.update("from", { text: "New unsent thought" });
  store.update("to", { text: "Existing unsent thought" });
  store.adopt("from", "to");
  expect(store.read("from").text).toBe("New unsent thought");
  expect(store.read("to").text).toBe("Existing unsent thought");
});

test("adopting a new conversation moves its draft and notifies active subscribers", () => {
  const store = new StudioChatDraftStore();
  const from = studioChatDraftKey(undefined, null);
  const to = studioChatDraftKey(undefined, "created");
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  store.update(from, { text: "Continue this thought" });
  store.adopt(from, to);
  expect(store.read(from).text).toBe("");
  expect(store.read(to).text).toBe("Continue this thought");
  expect(notifications).toBe(2);
  unsubscribe();
  store.update(to, { text: "" });
  expect(store.read(to).text).toBe("");
  expect(notifications).toBe(2);
});
