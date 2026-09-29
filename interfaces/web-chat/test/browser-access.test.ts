import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/sdk/interfaces";
import { createBrowserAccess } from "../src/browser-access";
import type { Conversation } from "@brains/plugins";

/**
 * The two questions every web-chat route asks first.
 *
 * They were private methods on the interface class, so nothing could exercise
 * them without standing up the plugin. They are a function of a principal and
 * the conversation store, and now take exactly that.
 */

function principal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    userId: "user-1",
    personId: "person-1",
    displayName: "Test User",
    role: "trusted",
    permissionLevel: "trusted",
    status: "active",
    isAnchor: false,
    ...overrides,
  };
}

function readerFor(input: {
  principal?: AuthPrincipal | undefined;
  conversation?: Conversation | null | undefined;
  started?: string[];
}): ReturnType<typeof createBrowserAccess> {
  return createBrowserAccess({
    resolveAuthPrincipal: async () => input.principal,
    createAuthLoginResponse: () => new Response("login", { status: 401 }),
    conversations: {
      get: async () => input.conversation ?? null,
      start: async (request) => {
        input.started?.push(request.sessionId);
        return request.sessionId;
      },
    },
  });
}

describe("who is at the browser", () => {
  it("lets an active trusted session chat", async () => {
    const access = await readerFor({ principal: principal() }).resolve(
      new Request("http://brain/chat"),
    );
    expect(access).toMatchObject({
      permissionLevel: "trusted",
      hasChatAccess: true,
    });
  });

  it("downgrades an inactive session to public rather than refusing it", async () => {
    // The page still has to render, with a login door on it.
    const access = await readerFor({
      principal: principal({ status: "suspended" }),
    }).resolve(new Request("http://brain/chat"));
    expect(access).toMatchObject({
      permissionLevel: "public",
      hasChatAccess: false,
    });
  });

  it("treats no session at all as public", async () => {
    const access = await readerFor({}).resolve(
      new Request("http://brain/chat"),
    );
    expect(access).toMatchObject({
      permissionLevel: "public",
      hasChatAccess: false,
    });
  });
});

describe("who owns the conversation", () => {
  it("refuses a conversation this caller does not own", async () => {
    const refusal = await readerFor({ conversation: null }).requireExisting(
      "thread-1",
      "web-chat",
      { permissionLevel: "trusted", personId: "person-1" },
    );
    expect(refusal?.status).toBe(404);
  });

  it("starts one that does not exist yet", async () => {
    const started: string[] = [];
    const reader = readerFor({ started });
    // `get` answers null before and after here, so the guard still refuses —
    // what this asserts is that it tried to start it first.
    await reader.ensure("thread-2", "web-chat", "Web Chat", {
      permissionLevel: "admin",
    });
    expect(started).toEqual(["thread-2"]);
  });

  it("refuses to start one for a trusted caller with no person", async () => {
    // Trusted is a fact about a person; without one there is nobody to own it.
    const started: string[] = [];
    const refusal = await readerFor({ started }).ensure(
      "thread-3",
      "web-chat",
      "Web Chat",
      { permissionLevel: "trusted" },
    );
    expect(refusal?.status).toBe(403);
    expect(started).toEqual([]);
  });
});
