import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  createPluginHarness,
  createStubAuth,
  createTestPrincipal,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { SitePageResponse } from "@brains/plugins/contracts/web-routes";
import { createServicePluginContext } from "@brains/plugins";
import type {
  IRuntimeStateStore,
  IRuntimeStateNamespace,
} from "@brains/runtime-state";
import { createWebChatPlugin } from "./helpers/definition";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  ASK_BOX_AVAILABILITY_OWNER,
  type AskBoxAvailability,
} from "@brains/contracts";
import {
  guestIssuanceNamespace,
  guestIssuanceStateSchema,
} from "../src/guest-issuance";
import {
  guestAdmissionNamespace,
  guestAdmissionStateSchema,
  type GuestAdmissionState,
} from "../src/guest-admission-state";

const harnesses: PluginTestHarness[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.reset();
});

interface Fixture {
  send(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    origin?: string,
  ): Promise<Response>;
  ledger: IRuntimeStateStore<GuestAdmissionState>;
  calls(): number;
  previewPaths: string[];
  askBox(): Promise<AskBoxAvailability | null>;
  state: IRuntimeStateNamespace;
  /** The owner opens guest chat in Studio with this monthly budget. */
  budget(monthlyUsd: number): Promise<void>;
}

async function fixture(
  role: "public" | "trusted" | "admin" = "admin",
  domain: string | null = "rizom.ai",
  options: {
    profileAvailable?: boolean;
    disabled?: boolean;
    copy?: { content: string; visibility: "public" | "restricted" };
    guest?: "local-test";
    state?: IRuntimeStateNamespace;
  } = {},
): Promise<Fixture> {
  const harness = createPluginHarness(domain ? { domain } : {});
  harnesses.push(harness);
  if (options.state)
    spyOn(harness.getMockShell(), "getRuntimeState").mockReturnValue(
      options.state,
    );
  if (options.copy)
    harness.addEntities([
      {
        id: "ask-content",
        entityType: "ask-content",
        metadata: {},
        ...options.copy,
      },
    ]);
  let calls = 0;
  harness.getMockShell().setAgentService({
    guestReady: options.profileAvailable !== false,
    chat: async (): Promise<never> => {
      calls++;
      throw new Error("Activation must not call the model");
    },
    confirmPendingAction: async (): Promise<never> => {
      throw new Error("No agent action expected");
    },
    invalidateAgent: (): void => {},
  });
  harness
    .getMockShell()
    .getAuthRegistry()
    .register(
      createStubAuth({
        ...(role === "public"
          ? {}
          : { principal: createTestPrincipal({ permissionLevel: role }) }),
      }),
    );
  const plugin = createWebChatPlugin(
    options.disabled
      ? { guest: false }
      : options.guest
        ? { guest: options.guest }
        : {},
  );
  const workspaces: StudioWorkspaceRegistration[] = [];
  harness
    .getMockShell()
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      STUDIO_WORKSPACE_REGISTER_MESSAGE,
      (registration) => {
        workspaces.push(registration.payload);
        return { success: true, data: { workspaceUrl: "/studio" } };
      },
    );
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  const ledger = harness
    .getMockShell()
    .getRuntimeState()
    .scoped({
      namespace: `interface:${Buffer.from("@brains/web-chat").toString("base64url")}:${Buffer.from("web-chat").toString("base64url")}:${guestAdmissionNamespace}`,
      schema: guestAdmissionStateSchema,
    });
  const studio = async (request: Record<string, unknown>): Promise<unknown> => {
    const monitor = workspaces.find((w) => w.id.endsWith(":guest-chat"));
    if (!monitor?.actionHandler)
      throw new Error("Guest chat monitor was not registered");
    return monitor.actionHandler(
      request,
      {
        interfaceType: "studio",
        userId: "owner",
        actor: { kind: "user", userId: "owner" },
        userPermissionLevel: "admin",
        visibilityScope: "restricted",
        isAnchor: true,
      },
      new AbortController().signal,
    );
  };
  const send = async (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    origin = "https://rizom.ai",
  ): Promise<Response> => {
    const method = body === undefined ? "GET" : "POST";
    const request = new Request(`${origin}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined
          ? {}
          : { Origin: "https://rizom.ai", "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const route = (plugin.getWebRoutes?.() ?? []).find(
      (r) => r.path === path && r.method === method,
    );
    return route
      ? route.handler(request, { remoteAddress: "172.18.0.2" })
      : new Response("Not found", { status: 404 });
  };
  return {
    send,
    ledger,
    calls: (): number => calls,
    state: harness.getMockShell().getRuntimeState(),
    budget: async (monthlyUsd): Promise<void> => {
      const input = { monthlyUsd };
      const { token } = z
        .object({ token: z.string() })
        .parse(await studio({ actionId: "switch-on", input, mode: "prepare" }));
      await studio({ actionId: "switch-on", input, confirmationToken: token });
    },
    askBox: (): Promise<AskBoxAvailability | null> =>
      createServicePluginContext(harness.getMockShell(), "site-worker", {
        executionOnly: true,
      }).interfaceAvailability.get(ASK_BOX_AVAILABILITY_OWNER),
    previewPaths: (plugin.getWebRoutes?.() ?? [])
      .filter((r) => r.preview === true)
      .map((r) => `${r.method} ${r.path}`)
      .sort(),
  };
}

const access = "/api/chat/guest/access";
describe("Ask box availability for site builds in any process", () => {
  it("records nothing served until the owner activates managed guest chat", async () => {
    const f = await fixture();
    expect(f.previewPaths).toContain("GET /ask/assets/box.js");
    expect(await f.askBox()).toEqual({ public: false, preview: false });
  });

  it("records the box served on preview once activated, and not after deactivation", async () => {
    const f = await fixture();
    await f.budget(10);
    expect(await f.askBox()).toEqual({ public: false, preview: true });
    expect((await f.send(access, { enabled: false })).status).toBe(200);
    expect(await f.askBox()).toEqual({ public: false, preview: false });
  });

  it("keeps preview availability after restart before profile readiness without admitting a turn", async () => {
    const running = await fixture();
    await running.budget(10);
    // A deploy restarts the app before the guest profile is ready.
    const restarted = await fixture("admin", "rizom.ai", {
      profileAvailable: false,
      state: running.state,
    });
    expect(await restarted.askBox()).toEqual({ public: false, preview: true });
    expect(
      (
        await restarted.send(
          "/api/chat/guest/session",
          {},
          { Origin: "https://preview.rizom.ai" },
          "https://preview.rizom.ai",
        )
      ).status,
    ).toBe(503);
    expect(restarted.calls()).toBe(0);
  });

  it("records a configured guest policy as served everywhere", async () => {
    const f = await fixture("admin", "rizom.ai", { guest: "local-test" });
    expect(await f.askBox()).toEqual({ public: true, preview: true });
  });

  it("records that it does not while guest chat is off", async () => {
    const f = await fixture("admin", "rizom.ai", { disabled: true });
    expect(f.previewPaths).not.toContain("GET /ask/assets/box.js");
    expect(await f.askBox()).toEqual({ public: false, preview: false });
  });
});

describe("admin guest activation using deployment conventions", () => {
  it("declares only the guest presentation and API routes for preview", async () => {
    const f = await fixture();
    expect(f.previewPaths).toEqual(
      [
        "DELETE /api/chat/guest/sessions",
        "GET /api/chat/guest/messages",
        "GET /ask",
        // Standalone GuestApp has its own bundle; the app bundle stays for sites still loading it.
        "GET /ask/assets/app.css",
        "GET /ask/assets/app.js",
        "GET /ask/assets/ask.css",
        "GET /ask/assets/ask.js",
        // The shared box loader every consuming site loads, the boot it loads
        // at the current version, and that version.
        "GET /ask/assets/boot.js",
        "GET /ask/assets/box.js",
        "GET /ask/assets/dashboard.css",
        "GET /ask/assets/dashboard.js",
        "GET /ask/assets/guest.css",
        "GET /ask/assets/guest.js",
        "GET /ask/assets/page.css",
        "GET /ask/assets/version",
        "POST /api/chat/guest",
        "POST /api/chat/guest/session",
      ].sort(),
    );
  });
  it.each(["public", "restricted", "invalid"] as const)(
    "loads only valid public authored copy into the guest session (%s)",
    async (kind) => {
      const f = await fixture("admin", "rizom.ai", {
        copy: {
          visibility: kind === "restricted" ? "restricted" : "public",
          content:
            kind === "invalid"
              ? "x".repeat(4001)
              : "---\ntitle: Ask us\ntopics: [Welcome]\n---\nAuthored welcome.",
        },
      });
      await f.budget(10);
      const response = await f.send(
        "/api/chat/guest/session",
        {},
        { Origin: "https://preview.rizom.ai" },
        "https://preview.rizom.ai",
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.presentation).toEqual(
        kind === "public"
          ? {
              title: "Ask us",
              topics: ["Welcome"],
              introduction: "Authored welcome.",
            }
          : undefined,
      );
      expect(f.calls()).toBe(0);
    },
  );

  it("serves scoped Ask styles without replacing the site chrome", async () => {
    const f = await fixture();
    await f.budget(10);
    const response = await f.send(
      "/ask/assets/page.css",
      undefined,
      {},
      "https://preview.rizom.ai",
    );
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toContain(".guest-ask");
    expect(css).not.toContain("guest-masthead");
    expect(css).not.toMatch(/(?:^|\n)body\s*\{/);
    expect(
      await f.send("/ask", undefined, {}, "https://preview.rizom.ai"),
    ).toBeInstanceOf(SitePageResponse);
    expect(await f.send("/ask")).not.toBeInstanceOf(SitePageResponse);
    const visitor = await fixture("public");
    expect((await visitor.send("/ask/assets/page.css")).status).toBe(404);
    expect(f.calls()).toBe(0);
  });

  it("derives the preview origin and shared limits without activating or allocating on read", async () => {
    const f = await fixture();
    const response = await f.send(access);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authorized: false,
      enabled: false,
      origin: "https://preview.rizom.ai",
      budgetMicroUsd: 0,
      chargedMicroUsd: 0,
      answerCapMicroUsd: 50_000,
    });
    expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
    expect(f.calls()).toBe(0);
  });

  it.each(["public", "trusted"] as const)(
    "rejects activation by %s callers before writing any authorization",
    async (role) => {
      const f = await fixture(role);
      const response = await f.send(access, { enabled: true });
      expect(response.status).toBe(role === "public" ? 401 : 403);
      expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
      expect(f.calls()).toBe(0);
    },
  );

  it("rejects cross-origin activation even for an authenticated admin", async () => {
    const f = await fixture();
    const response = await f.send(
      access,
      { enabled: true },
      {
        Origin: "https://attacker.test",
        "Sec-Fetch-Site": "cross-site",
      },
    );
    expect(response.status).toBe(403);
    expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
  });

  it("reopens only with the owner's budget, ignoring forwarding claims when deriving its target", async () => {
    const f = await fixture();
    expect((await f.send(access, { enabled: true })).status).toBe(409);
    expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
    await f.budget(10);
    expect((await f.send(access, { enabled: false })).status).toBe(200);
    const response = await f.send(
      access,
      { enabled: true },
      {
        "X-Forwarded-Host": "attacker.test",
        Forwarded: "host=attacker.test;proto=https",
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      enabled: true,
      origin: "https://preview.rizom.ai",
    });
    const records = await f.ledger.list({ limit: 10 });
    expect(records).toHaveLength(1);
    expect(records[0]?.value).toMatchObject({
      enabled: true,
      budget: {
        origin: "https://preview.rizom.ai",
        monthlyMicroUsd: 10_000_000,
      },
    });
    expect(f.calls()).toBe(0);
  });

  it("adopts changed session limits when the owner switches guest chat on", async () => {
    const f = await fixture();
    // A deployment whose session ledger was written under earlier limits.
    await f.state
      .scoped({
        namespace: `interface:${Buffer.from("@brains/web-chat").toString("base64url")}:${Buffer.from("web-chat").toString("base64url")}:${guestIssuanceNamespace}`,
        schema: guestIssuanceStateSchema,
      })
      .set("deployment", {
        version: 1,
        revision: 4,
        policy: "a".repeat(64),
        enabled: true,
        lastSeenAt: Date.now() - 60_000,
        attempts: [],
        slots: {},
      });
    const session = (): Promise<Response> =>
      f.send(
        "/api/chat/guest/session",
        {},
        { Origin: "https://preview.rizom.ai" },
        "https://preview.rizom.ai",
      );
    await f.budget(10);
    expect((await session()).status).toBe(200);
    // Reopening through the endpoint adopts them too.
    expect((await f.send(access, { enabled: false })).status).toBe(200);
    expect((await f.send(access, { enabled: true })).status).toBe(200);
    expect((await session()).status).toBe(200);
  });

  it("brings the session ledger to the limits the owner approved when it restarts", async () => {
    const running = await fixture();
    await running.budget(10);
    const sessions = running.state.scoped({
      namespace: `interface:${Buffer.from("@brains/web-chat").toString("base64url")}:${Buffer.from("web-chat").toString("base64url")}:${guestIssuanceNamespace}`,
      schema: guestIssuanceStateSchema,
    });
    const ledger = await sessions.get("deployment");
    // As a deployment finds it after a release changed its session limits.
    await sessions.set("deployment", {
      ...(ledger ?? {
        version: 1,
        revision: 0,
        enabled: true,
        lastSeenAt: Date.now() - 60_000,
        attempts: [],
        slots: {},
      }),
      policy: "a".repeat(64),
    });
    const restarted = await fixture("admin", "rizom.ai", {
      state: running.state,
    });
    expect(
      (
        await restarted.send(
          "/api/chat/guest/session",
          {},
          { Origin: "https://preview.rizom.ai" },
          "https://preview.rizom.ai",
        )
      ).status,
    ).toBe(200);
  });

  it("never returns the month's charge when toggled or retried", async () => {
    const f = await fixture();
    await f.budget(1);
    const record = (await f.ledger.list({ limit: 10 }))[0];
    if (!record) throw new Error("Expected authorized ledger");
    const month = {
      key: new Date().toISOString().slice(0, 7),
      chargedMicroUsd: 1_000_000,
    };
    expect(
      await f.ledger.compareAndSet(record.key, record.value, {
        ...record.value,
        month,
      }),
    ).toBe(true);
    for (const enabled of [false, true, true]) {
      expect((await f.send(access, { enabled })).status).toBe(200);
      expect(await f.ledger.get(record.key)).toMatchObject({
        month,
        budget: {
          origin: "https://preview.rizom.ai",
          monthlyMicroUsd: 1_000_000,
        },
      });
    }
    expect(await f.askBox()).toEqual({ public: false, preview: false });
    expect(f.calls()).toBe(0);
  });

  it("does not accept hostname, budget or reset overrides through activation", async () => {
    const f = await fixture();
    for (const extra of [
      { origin: "https://rizom.ai" },
      { allowance: { requests: 99, usd: 100 } },
      { monthlyUsd: 100 },
      { reset: true },
    ]) {
      expect((await f.send(access, { enabled: true, ...extra })).status).toBe(
        400,
      );
    }
    expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
  });

  it.each([{ profileAvailable: false }, { disabled: true }])(
    "cannot activate an unavailable or explicitly disabled runtime: %j",
    async (options) => {
      const f = await fixture("admin", "rizom.ai", options);
      expect((await f.send(access, { enabled: true })).status).toBe(503);
      expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
      expect(f.calls()).toBe(0);
    },
  );

  it("fails closed when the deployment has no preview origin", async () => {
    const f = await fixture("admin", null);
    expect((await f.send(access, { enabled: true })).status).toBe(503);
    expect(await f.ledger.list({ limit: 10 })).toHaveLength(0);
  });
});
