import { describe, expect, it } from "bun:test";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";
import {
  GuestVisitorStore,
  canAccessGuestConversation,
} from "../src/guest-access";
import { guestInterfaceType } from "@brains/contracts/chat";
import {
  canAccessBrowserConversation,
  type WebChatConversation,
} from "../src/conversation-access";
import { testGuestPolicy } from "./fixtures/guest-policy";

const now = Date.parse("2026-06-01T12:00:00Z");

function request(cookie?: string, origin = testGuestPolicy.origin): Request {
  return new Request(`${origin}/api/chat/guest/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: "{}",
  });
}

function conversation(visitorId: string): WebChatConversation {
  return {
    id: "server-minted-conversation",
    sessionId: "server-minted-conversation",
    interfaceType: guestInterfaceType,
    channelId: "server-minted-conversation",
    startedAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    metadata: { guest: { visitorId, retention: testGuestPolicy.retention } },
  };
}

describe("guest visitor ownership foundation", () => {
  it("issues opaque host-only cookies and persists only credential digests", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const visitors = new GuestVisitorStore(state, testGuestPolicy, () => now);
    const issued = await visitors.issue(request());
    expect(issued.cookie).toMatch(/^__Host-brain-visitor=[A-Za-z0-9_-]{43};/);
    expect(issued.cookie).toContain("; HttpOnly");
    expect(issued.cookie).toContain("; Secure");
    expect(issued.cookie).toContain("; SameSite=Strict");
    expect(issued.cookie).toContain("; Path=/");
    expect(issued.cookie).not.toContain("Domain=");
    expect(issued.visitor.kind).toBe("guest");
    expect(await visitors.resolve(request(issued.cookie))).toEqual(
      issued.visitor,
    );

    // Another instance using the same persistence resolves it after restart.
    const restarted = new GuestVisitorStore(state, testGuestPolicy, () => now);
    expect(await restarted.resolve(request(issued.cookie))).toEqual(
      issued.visitor,
    );
    const token = issued.cookie.split(";")[0]?.split("=")[1];
    if (!token) throw new Error("Expected issued credential");
    const records = await state
      .scoped({ namespace: "web-chat.guest-visitors", schema: z.unknown() })
      .list();
    expect(records).toHaveLength(1);
    expect(records[0]?.key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(records)).not.toContain(token);
  });

  it("rejects fixation, ambiguous cookies and browser-supplied identities", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => now,
    );
    expect(
      await visitors.resolve(request("__Host-brain-visitor=forged")),
    ).toBeNull();
    expect(
      await visitors.resolve(
        new Request(
          "https://brain.test/api/chat/guest/session?visitorId=admin",
          {
            headers: { Authorization: "Bearer admin", "X-Actor-Id": "admin" },
          },
        ),
      ),
    ).toBeNull();
    const issued = await visitors.issue(
      request("__Host-brain-visitor=attacker-chosen"),
    );
    expect(issued.cookie).not.toContain("attacker-chosen");
    const cookie = issued.cookie.split(";")[0];
    expect(await visitors.resolve(request(`${cookie}; ${cookie}`))).toBeNull();
  });

  it("rejects foreign origins, cross-origin issuance and non-JSON mutations", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => now,
    );
    for (const req of [
      request(undefined, "https://evil.test"),
      new Request("https://brain.test/api/chat/guest/session", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
      }),
      new Request("https://brain.test/api/chat/guest/session", {
        method: "POST",
      }),
      new Request("https://brain.test/api/chat/guest/session"),
    ]) {
      expect(visitors.issue(req)).rejects.toThrow("Guest request denied");
    }
  });

  it("isolates preview credentials from production even with shared persistence", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const production = new GuestVisitorStore(state, testGuestPolicy, () => now);
    const previewPolicy = {
      ...testGuestPolicy,
      origin: "https://preview.brain.test",
    };
    const preview = new GuestVisitorStore(state, previewPolicy, () => now);
    const issued = await production.issue(request());
    expect(
      await preview.resolve(request(issued.cookie, previewPolicy.origin)),
    ).toBeNull();
    expect(
      await production.resolve(request(issued.cookie, previewPolicy.origin)),
    ).toBeNull();
  });

  it("expires credentials at the boundary and revokes across instances", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let clock = now;
    const visitors = new GuestVisitorStore(state, testGuestPolicy, () => clock);
    const issued = await visitors.issue(request());
    clock += testGuestPolicy.retention.idleSeconds * 1000;
    expect(await visitors.resolve(request(issued.cookie))).toBeNull();
    const fresh = await visitors.issue(request());
    await visitors.revoke(request(fresh.cookie));
    const restarted = new GuestVisitorStore(
      state,
      testGuestPolicy,
      () => clock,
    );
    expect(await restarted.resolve(request(fresh.cookie))).toBeNull();
  });

  it("cleans fixed expired credential leases in bounded pages even when admission is disabled", async () => {
    const state = createMemoryRuntimeStateNamespace();
    let clock = now;
    const visitors = new GuestVisitorStore(state, testGuestPolicy, () => clock);
    const expired = await visitors.issue(request());
    await visitors.issue(request());
    clock += testGuestPolicy.retention.idleSeconds * 1000;
    const live = await visitors.issue(request());
    const maintenance = new GuestVisitorStore(
      state,
      { enabled: false },
      () => clock,
    );
    let cursor: string | undefined;
    let removed = 0;
    for (let page = 0; page < 4; page++) {
      const result = await maintenance.cleanup(cursor, 1);
      expect(result.removed).toBeLessThanOrEqual(1);
      removed += result.removed;
      cursor = result.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(cursor).toBeUndefined();
    expect(removed).toBe(2);
    expect(await visitors.resolve(request(expired.cookie))).toBeNull();
    expect(await visitors.resolve(request(live.cookie))).toEqual(live.visitor);
    expect(await maintenance.cleanup()).toEqual({
      removed: 0,
      nextCursor: null,
      uncertain: 0,
    });
  });

  it("does not extend a conversation's pinned retention when current policy permits longer storage", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => now,
    );
    const { visitor } = await visitors.issue(request());
    const chat = {
      ...conversation(visitor.id),
      metadata: {
        guest: {
          visitorId: visitor.id,
          retention: { idleSeconds: 1, maxAgeSeconds: 1 },
        },
      },
    };
    expect(
      canAccessGuestConversation(chat, visitor, testGuestPolicy, now),
    ).toBe(true);
    expect(
      canAccessGuestConversation(chat, visitor, testGuestPolicy, now + 1000),
    ).toBe(false);
  });

  it("restricts guest conversations to their live owner and rejects authenticated admission", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => now,
    );
    const first = await visitors.issue(request());
    const second = await visitors.issue(request());
    const owned = conversation(first.visitor.id);
    expect(
      canAccessGuestConversation(owned, first.visitor, testGuestPolicy, now),
    ).toBe(true);
    expect(
      canAccessGuestConversation(owned, second.visitor, testGuestPolicy, now),
    ).toBe(false);
    expect(
      canAccessGuestConversation(null, first.visitor, testGuestPolicy, now),
    ).toBe(false);
    expect(
      canAccessGuestConversation(
        { ...owned, interfaceType: "web-chat" },
        first.visitor,
        testGuestPolicy,
        now,
      ),
    ).toBe(false);
    expect(
      canAccessGuestConversation(
        { ...owned, personId: "admin" },
        first.visitor,
        testGuestPolicy,
        now,
      ),
    ).toBe(false);
    expect(
      canAccessGuestConversation(
        { ...owned, metadata: {} },
        first.visitor,
        testGuestPolicy,
        now,
      ),
    ).toBe(false);
    expect(
      canAccessGuestConversation(
        { ...owned, lastActiveAt: "invalid" },
        first.visitor,
        testGuestPolicy,
        now,
      ),
    ).toBe(false);
    expect(
      canAccessGuestConversation(
        owned,
        first.visitor,
        testGuestPolicy,
        now + testGuestPolicy.retention.maxAgeSeconds * 1000,
      ),
    ).toBe(false);
    for (const permissionLevel of ["admin", "trusted", "public"] as const) {
      expect(
        canAccessBrowserConversation(
          owned,
          { permissionLevel, personId: "admin" },
          guestInterfaceType,
        ),
      ).toBe(false);
    }
  });

  it("denies expired history independently of a fresh visitor lease", async () => {
    let clock = now;
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => clock,
    );
    const issued = await visitors.issue(request());
    const owned = conversation(issued.visitor.id);
    clock += testGuestPolicy.retention.idleSeconds * 1000;
    const liveVisitor = { ...issued.visitor, expiresAt: clock + 1000 };
    expect(
      canAccessGuestConversation(owned, liveVisitor, testGuestPolicy, clock),
    ).toBe(false);
    const ancient = {
      ...owned,
      startedAt: new Date(
        clock - testGuestPolicy.retention.maxAgeSeconds * 1000,
      ).toISOString(),
      lastActiveAt: new Date(clock).toISOString(),
    };
    expect(
      canAccessGuestConversation(ancient, liveVisitor, testGuestPolicy, clock),
    ).toBe(false);
  });

  it("rejects cross-origin revocation without invalidating the credential", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      testGuestPolicy,
      () => now,
    );
    const issued = await visitors.issue(request());
    expect(
      visitors.revoke(request(issued.cookie, "https://evil.test")),
    ).rejects.toThrow("Guest request denied");
    expect(await visitors.resolve(request(issued.cookie))).toEqual(
      issued.visitor,
    );
  });

  it("fails closed when persistence is unavailable", async () => {
    const state = createMemoryRuntimeStateNamespace();
    const visitors = new GuestVisitorStore(
      {
        scoped: <T>(
          options: RuntimeStateScopeOptions<T>,
        ): IRuntimeStateStore<T> => ({
          ...state.scoped(options),
          get: async (): Promise<never> => {
            throw new Error("Storage unavailable");
          },
          setIfNotExists: async (): Promise<never> => {
            throw new Error("Storage unavailable");
          },
        }),
      },
      testGuestPolicy,
      () => now,
    );
    expect(visitors.issue(request())).rejects.toThrow(
      "Guest access unavailable",
    );
    expect(
      visitors.resolve(request(`__Host-brain-visitor=${"a".repeat(43)}`)),
    ).rejects.toThrow("Guest access unavailable");
  });

  it("uses a separate non-Secure cookie only for explicitly configured loopback development", async () => {
    const localPolicy = { ...testGuestPolicy, origin: "http://localhost:8080" };
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      localPolicy,
      () => now,
    );
    const issued = await visitors.issue(request(undefined, localPolicy.origin));
    expect(issued.cookie).toMatch(/^brain-visitor-dev=/);
    expect(issued.cookie).not.toContain("; Secure");
    expect(
      await visitors.resolve(request(issued.cookie, localPolicy.origin)),
    ).toEqual(issued.visitor);
  });

  it("does not issue or resolve visitors when the kill switch is off", async () => {
    const visitors = new GuestVisitorStore(
      createMemoryRuntimeStateNamespace(),
      { enabled: false },
      () => now,
    );
    expect(visitors.issue(request())).rejects.toThrow(
      "Guest access unavailable",
    );
    expect(
      await visitors.resolve(request("__Host-brain-visitor=forged")),
    ).toBeNull();
  });
});
