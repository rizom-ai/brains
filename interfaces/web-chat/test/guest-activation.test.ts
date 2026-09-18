import { afterEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  createStubAuth,
  createTestPrincipal,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { SitePageResponse } from "@brains/plugins/contracts/web-routes";
import type { IRuntimeStateStore } from "@brains/runtime-state";
import { createWebChatPlugin } from "./helpers/definition";
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
}

async function fixture(
  role: "public" | "trusted" | "admin" = "admin",
  domain: string | null = "rizom.ai",
  options: { profileAvailable?: boolean; disabled?: boolean } = {},
): Promise<Fixture> {
  const harness = createPluginHarness(domain ? { domain } : {});
  harnesses.push(harness);
  let calls = 0;
  harness.getMockShell().setAgentService({
    guestProfileAvailable: options.profileAvailable !== false,
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
  const plugin = createWebChatPlugin(options.disabled ? { guest: false } : {});
  await harness.installPlugin(plugin);
  const ledger = harness
    .getMockShell()
    .getRuntimeState()
    .scoped({
      namespace: `interface:${Buffer.from("@brains/web-chat").toString("base64url")}:${Buffer.from("web-chat").toString("base64url")}:${guestAdmissionNamespace}`,
      schema: guestAdmissionStateSchema,
    });
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
    previewPaths: (plugin.getWebRoutes?.() ?? [])
      .filter((r) => r.preview === true)
      .map((r) => `${r.method} ${r.path}`)
      .sort(),
  };
}

const access = "/api/chat/guest/access";
describe("admin guest activation using deployment conventions", () => {
  it("declares only the guest presentation and API routes for preview", async () => {
    const f = await fixture();
    expect(f.previewPaths).toEqual(
      [
        "DELETE /api/chat/guest/sessions",
        "GET /api/chat/guest/messages",
        "GET /ask",
        // Standalone GuestApp uses the shared Chat presentation bundle.
        "GET /ask/assets/app.css",
        "GET /ask/assets/app.js",
        "GET /ask/assets/dashboard.css",
        "GET /ask/assets/dashboard.js",
        "GET /ask/assets/guest.css",
        "GET /ask/assets/guest.js",
        "GET /ask/assets/page.css",
        "POST /api/chat/guest",
        "POST /api/chat/guest/session",
      ].sort(),
    );
  });
  it("serves scoped Ask styles without replacing the site chrome", async () => {
    const f = await fixture();
    await f.send(access, { enabled: true });
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
      enabled: false,
      origin: "https://preview.rizom.ai",
      allowance: { requests: 2, usd: 4 },
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

  it("records the one-off authorization and ignores forwarding claims when deriving its target", async () => {
    const f = await fixture();
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
      authorization: {
        origin: "https://preview.rizom.ai",
        requests: 2,
        maxCostMicroUsd: 4_000_000,
      },
      lifetime: { requests: 0, reservedMicroUsd: 0 },
    });
    expect(f.calls()).toBe(0);
  });

  it("does not renew consumed authorization when toggled or retried", async () => {
    const f = await fixture();
    expect((await f.send(access, { enabled: true })).status).toBe(200);
    const record = (await f.ledger.list({ limit: 10 }))[0];
    if (!record) throw new Error("Expected authorized ledger");
    expect(
      await f.ledger.compareAndSet(record.key, record.value, {
        ...record.value,
        lifetime: { requests: 2, reservedMicroUsd: 4_000_000 },
      }),
    ).toBe(true);
    for (const enabled of [false, true, true]) {
      expect((await f.send(access, { enabled })).status).toBe(200);
      expect(await f.ledger.get(record.key)).toMatchObject({
        lifetime: { requests: 2, reservedMicroUsd: 4_000_000 },
        authorization: {
          origin: "https://preview.rizom.ai",
          requests: 2,
          maxCostMicroUsd: 4_000_000,
        },
      });
    }
    expect(f.calls()).toBe(0);
  });

  it("does not accept hostname, budget or reset overrides through activation", async () => {
    const f = await fixture();
    for (const extra of [
      { origin: "https://rizom.ai" },
      { allowance: { requests: 99, usd: 100 } },
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
