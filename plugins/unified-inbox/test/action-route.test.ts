import { describe, expect, it } from "bun:test";
import { InboxRegistry, type InboxItem } from "@brains/plugins";

import {
  INBOX_ACTION_PATH,
  InboxDataSource,
  InboxOperatorService,
  createInboxActionRoute,
} from "../src";

const item: InboxItem = {
  id: "mail-opaque",
  title: "Time-sensitive work request",
  receivedAt: "2026-08-05T09:00:00.000Z",
  urgency: "high",
  actions: [{ id: "archive", label: "Archive", confirm: true }],
};

function actionRequest(
  payload: unknown,
  options: {
    origin?: string | null;
    contentType?: string;
  } = {},
): Request {
  const headers = new Headers();
  const origin =
    options.origin === undefined ? "https://brain.test" : options.origin;
  if (origin !== null) headers.set("Origin", origin);
  headers.set("Content-Type", options.contentType ?? "application/json");
  headers.set("Host", "brain.test");
  return new Request(`https://brain.test${INBOX_ACTION_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

function createRoute(
  permissionLevel: "admin" | "trusted" | "public" | undefined,
): {
  route: ReturnType<typeof createInboxActionRoute>;
  getCalls: () => number;
} {
  let open = true;
  let calls = 0;
  const registry = new InboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => (open ? [item] : []),
    act: async () => {
      calls += 1;
      open = false;
    },
  });
  registry.finalize();
  const route = createInboxActionRoute({
    getOperator: () =>
      new InboxOperatorService(registry, new InboxDataSource(registry)),
    resolvePrincipal: async () =>
      permissionLevel ? { permissionLevel } : undefined,
  });
  return { route, getCalls: (): number => calls };
}

const action = {
  sourceId: "mail-items",
  itemId: "mail-opaque",
  actionId: "archive",
};

describe("unified inbox action route", () => {
  it("requires same-origin JSON and an authenticated Admin", async () => {
    const admin = createRoute("admin");
    const trusted = createRoute("trusted");
    const anonymous = createRoute(undefined);

    const missingOrigin = await admin.route.handler(
      actionRequest(action, { origin: null }),
    );
    const crossOrigin = await admin.route.handler(
      actionRequest(action, { origin: "https://evil.test" }),
    );
    const nonJson = await admin.route.handler(
      actionRequest(action, { contentType: "text/plain" }),
    );
    const denied = await trusted.route.handler(actionRequest(action));
    const unauthenticated = await anonymous.route.handler(
      actionRequest(action),
    );

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(nonJson.status).toBe(415);
    expect(denied.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    expect(admin.getCalls()).toBe(0);
    expect(trusted.getCalls()).toBe(0);
  });

  it("requires explicit confirmation, dispatches, and returns the live re-list", async () => {
    const fixture = createRoute("admin");

    const requested = await fixture.route.handler(actionRequest(action));
    expect(requested.status).toBe(409);
    expect(await requested.json()).toEqual({
      confirmationRequired: true,
      summary: 'Archive "Time-sensitive work request"?',
    });
    expect(fixture.getCalls()).toBe(0);

    const completed = await fixture.route.handler(
      actionRequest({ ...action, confirmed: true }),
    );
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({
      success: true,
      data: { entries: [], errors: [] },
    });
    expect(fixture.getCalls()).toBe(1);
  });

  it("never exposes source exception text", async () => {
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => [item],
      act: async () => {
        throw new Error("private mailbox failure");
      },
    });
    registry.finalize();
    const route = createInboxActionRoute({
      getOperator: () =>
        new InboxOperatorService(registry, new InboxDataSource(registry)),
      resolvePrincipal: async () => ({ permissionLevel: "admin" }),
    });

    const response = await route.handler(
      actionRequest({ ...action, confirmed: true }),
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("Inbox action failed");
    expect(body).not.toContain("private mailbox failure");
  });
});
