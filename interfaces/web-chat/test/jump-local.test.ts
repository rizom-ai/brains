import { describe, expect, it } from "bun:test";
import {
  buildConversationJumpGroup,
  parseChatSessionHash,
} from "../ui-react/src/jump-local";

const sessions = [
  { id: "abc", title: "Verdigris pigments" },
  { id: "def", title: "Trust series planning" },
  { id: "ghi", title: "RFC 9421 signing" },
];

describe("buildConversationJumpGroup", () => {
  it("lists conversations as chat doors", () => {
    const group = buildConversationJumpGroup(sessions, "");

    expect(group?.label).toBe("Conversations");
    expect(group?.items[0]).toEqual({
      id: "session/abc",
      title: "Verdigris pigments",
      href: "/chat#s/abc",
      tag: "chat",
    });
    expect(group?.items).toHaveLength(3);
  });

  it("filters by the query, case-insensitively", () => {
    const group = buildConversationJumpGroup(sessions, "TRUST");

    expect(group?.items.map((item) => item.id)).toEqual(["session/def"]);
  });

  it("returns null when nothing matches", () => {
    expect(buildConversationJumpGroup(sessions, "zzz")).toBeNull();
    expect(buildConversationJumpGroup([], "")).toBeNull();
  });

  it("encodes session ids into the door", () => {
    const group = buildConversationJumpGroup(
      [{ id: "a/b c", title: "Odd id" }],
      "",
    );

    expect(group?.items[0]?.href).toBe("/chat#s/a%2Fb%20c");
  });
});

describe("parseChatSessionHash", () => {
  it("extracts the session id from a jump door", () => {
    expect(parseChatSessionHash("#s/abc")).toBe("abc");
    expect(parseChatSessionHash("#s/a%2Fb%20c")).toBe("a/b c");
  });

  it("rejects everything else", () => {
    expect(parseChatSessionHash("")).toBeNull();
    expect(parseChatSessionHash("#s/")).toBeNull();
    expect(parseChatSessionHash("#other")).toBeNull();
  });
});
