import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { studioPlugin, type StudioPlugin } from "../src";

const authPlugins: AuthServicePlugin[] = [];

function findRoute(
  plugin: StudioPlugin,
  path: string,
  method: "GET" | "POST",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) => candidate.path === path && candidate.method === method,
    );
  if (!route) throw new Error(`Missing route: ${method} ${path}`);
  return route;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json();
}

function workspaceId(value: unknown): string {
  if (value === null || typeof value !== "object") {
    throw new Error("Expected navigation response");
  }
  const workspaces = Reflect.get(value, "workspaces");
  if (!Array.isArray(workspaces)) throw new Error("Expected workspaces");
  const invitation = workspaces.find(
    (workspace) =>
      workspace !== null &&
      typeof workspace === "object" &&
      Reflect.get(workspace, "label") === "Invitations",
  );
  const id = invitation && Reflect.get(invitation, "id");
  if (typeof id !== "string") {
    throw new Error("Expected Invitations workspace id");
  }
  return id;
}

function findById(value: unknown, id: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (Reflect.get(value, "id") === id) return value;
  for (const child of Object.values(value)) {
    const result = findById(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

function findRowForPerson(value: unknown, displayName: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const cells = Reflect.get(value, "cells");
  if (
    cells !== null &&
    typeof cells === "object" &&
    Reflect.get(cells, "person") === displayName
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findRowForPerson(child, displayName);
    if (result !== undefined) return result;
  }
  return undefined;
}

function findAction(value: unknown, label: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (Reflect.get(value, "label") === label && Reflect.has(value, "actionId")) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findAction(child, label);
    if (result !== undefined) return result;
  }
  return undefined;
}

function actionRequest(
  action: unknown,
  phase?: { mode: "prepare" } | { mode: "execute"; token: string },
): Record<string, unknown> {
  if (action === null || typeof action !== "object") {
    throw new Error("Expected action control");
  }
  const actionId = Reflect.get(action, "actionId");
  if (typeof actionId !== "string") throw new Error("Expected action id");
  return {
    actionId,
    input: Reflect.get(action, "input"),
    ...(phase?.mode === "prepare"
      ? { mode: "prepare" }
      : phase?.mode === "execute"
        ? { mode: "execute", confirmationToken: phase.token }
        : {}),
  };
}

afterEach(async () => {
  for (const plugin of authPlugins.splice(0)) {
    await plugin.shutdown?.();
  }
});

describe("built-in Studio Invitations workspace", () => {
  it("preserves the Admin invitation lifecycle without retaining setup URLs", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "manual-test",
      displayName: "Manual test",
      subjectLabel: "Address",
      manualDelivery: true,
    });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "failing-auto",
      displayName: "Failing automatic test",
      subjectLabel: "Address",
    });
    shell.getChannelRegistry().registerDeliveryProvider("test", {
      channelType: "failing-auto",
      isAvailable: async () => true,
      send: async () => ({ status: "failed", failureCode: "test-failure" }),
    });
    shell.getChannelRegistry().finalize();
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-studio-invitations-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const trusted = await service.createUser({
      displayName: "Tess Trusted",
      role: "trusted",
    });
    const [adminSession, trustedSession] = await Promise.all([
      service.createAuthSession(admin.userId),
      service.createAuthSession(trusted.userId),
    ]);
    const studio = studioPlugin();
    await studio.register(shell);
    await studio.finalizeRegistration();

    const typesRoute = findRoute(studio, "/studio/api/types", "GET");
    const adminNavigation = await responseJson(
      await typesRoute.handler(
        new Request("https://yeehaa.io/studio/api/types", {
          headers: { Cookie: adminSession.cookie },
        }),
      ),
    );
    const id = workspaceId(adminNavigation);
    expect(id).toBe("studio:invitations");
    const trustedNavigation = await responseJson(
      await typesRoute.handler(
        new Request("https://yeehaa.io/studio/api/types", {
          headers: { Cookie: trustedSession.cookie },
        }),
      ),
    );
    expect(JSON.stringify(trustedNavigation)).not.toContain(id);

    const workspaceRoute = findRoute(studio, "/studio/api/workspace", "GET");
    const actionRoute = findRoute(studio, "/studio/api/workspace", "POST");
    const load = async (query = ""): Promise<unknown> =>
      responseJson(
        await workspaceRoute.handler(
          new Request(
            `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(id)}${query}`,
            { headers: { Cookie: adminSession.cookie } },
          ),
        ),
      );
    const act = async (action: unknown): Promise<unknown> =>
      responseJson(
        await actionRoute.handler(
          new Request("https://yeehaa.io/studio/api/workspace", {
            method: "POST",
            headers: {
              Cookie: adminSession.cookie,
              Origin: "https://yeehaa.io",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ id, action }),
          }),
        ),
      );

    const initial = await load();
    expect(initial).toMatchObject({
      workspace: { id, data: { view: { title: "Invitations" } } },
    });
    expect(findAction(initial, "Add a person")).toMatchObject({
      actionId: "create-invitation",
      form: { submitLabel: "Create invitation" },
    });
    const prefilled = await load(
      "&peerId=did%3Aweb%3Agrace.example&displayName=Grace%20Hopper",
    );
    expect(findAction(prefilled, "Add a person")).toMatchObject({
      input: {
        peerId: "did:web:grace.example",
        displayName: "Grace Hopper",
      },
    });

    const createControl = findAction(initial, "Add a person");
    if (!createControl || typeof createControl !== "object") {
      throw new Error("Expected create action");
    }
    const created = await act({
      ...actionRequest(createControl),
      input: {
        idempotencyKey: Reflect.get(
          Reflect.get(createControl, "input"),
          "idempotencyKey",
        ),
        displayName: "Grace Hopper",
        role: "trusted",
        deliveryType: "manual-test",
        deliverySubject: "grace@example.test",
        deliveryLabel: "Grace",
        deliveryMode: "manual",
      },
    });
    const result =
      created !== null && typeof created === "object"
        ? Reflect.get(created, "result")
        : undefined;
    const setupUrl =
      result !== null && typeof result === "object"
        ? Reflect.get(result, "setupUrl")
        : undefined;
    if (typeof setupUrl !== "string") throw new Error("Expected setup URL");
    expect(setupUrl).toContain("token=");
    expect(
      result !== null && typeof result === "object"
        ? Reflect.get(result, "status")
        : undefined,
    ).toContain("Manual delivery");

    const afterCreate = await load();
    const failingCreate = findAction(afterCreate, "Add a person");
    if (!failingCreate || typeof failingCreate !== "object") {
      throw new Error("Expected another create action");
    }
    const failed = await act({
      ...actionRequest(failingCreate),
      input: {
        idempotencyKey: Reflect.get(
          Reflect.get(failingCreate, "input"),
          "idempotencyKey",
        ),
        displayName: "Failed Delivery",
        role: "trusted",
        deliveryType: "failing-auto",
        deliverySubject: "failed@example.test",
        deliveryMode: "automatic",
      },
    });
    const failedResult =
      failed !== null && typeof failed === "object"
        ? Reflect.get(failed, "result")
        : undefined;
    expect(
      failedResult !== null && typeof failedResult === "object"
        ? Reflect.get(failedResult, "status")
        : undefined,
    ).toContain("delivery failed");
    const failedView = await load();
    const retry = findAction(failedView, "Retry");
    if (!retry) throw new Error("Expected failed-delivery retry action");
    await act(actionRequest(retry));

    const pending = await load();
    expect(JSON.stringify(pending)).not.toContain(setupUrl);
    const pendingTable = findById(pending, "invitations");
    expect(pendingTable).toMatchObject({ type: "table" });
    expect(JSON.stringify(pendingTable)).toContain("Grace Hopper");
    expect(JSON.stringify(pendingTable)).toContain('"state":"pending"');
    expect(JSON.stringify(pendingTable)).toContain('"destination":"Grace"');
    const confirm = findAction(pending, "Confirm delivered");
    if (!confirm) throw new Error("Expected manual confirmation action");
    await act(actionRequest(confirm));
    expect(
      (await service.listAdminUsers()).find(
        (user) => user.displayName === "Grace Hopper",
      )?.invitation?.state,
    ).toBe("sent");

    const sent = await load();
    const resend = findAction(sent, "Resend");
    if (!resend) throw new Error("Expected resend action");
    const resent = await act(actionRequest(resend));
    const resentResult =
      resent !== null && typeof resent === "object"
        ? Reflect.get(resent, "result")
        : undefined;
    expect(
      resentResult !== null && typeof resentResult === "object"
        ? Reflect.get(resentResult, "status")
        : undefined,
    ).toContain("Manual delivery");
    expect(
      resentResult !== null && typeof resentResult === "object"
        ? Reflect.get(resentResult, "setupUrl")
        : undefined,
    ).toContain("token=");

    const resentView = await load();
    const cancel = findAction(
      findRowForPerson(resentView, "Grace Hopper"),
      "Cancel",
    );
    if (!cancel) throw new Error("Expected cancel action");
    const prepared = await act(actionRequest(cancel, { mode: "prepare" }));
    const preparedResult =
      prepared !== null && typeof prepared === "object"
        ? Reflect.get(prepared, "result")
        : undefined;
    expect(
      preparedResult !== null && typeof preparedResult === "object"
        ? Reflect.get(preparedResult, "kind")
        : undefined,
    ).toBe("prepared-confirmation");
    expect(
      preparedResult !== null && typeof preparedResult === "object"
        ? Reflect.get(preparedResult, "summary")
        : undefined,
    ).toContain("Cancel this invitation");
    const token =
      preparedResult !== null && typeof preparedResult === "object"
        ? Reflect.get(preparedResult, "token")
        : undefined;
    if (typeof token !== "string")
      throw new Error("Expected confirmation token");
    await act(actionRequest(cancel, { mode: "execute", token }));

    const history = await load("&state=history");
    expect(findById(history, "invitations")).toMatchObject({
      type: "table",
      rows: [
        {
          cells: { person: "Grace Hopper", state: "cancelled" },
        },
      ],
    });
    expect(findAction(history, "Cancel")).toBeUndefined();
    const invitationAudit = await service.listAuditEvents();
    for (const action of [
      "auth.invitation.created",
      "auth.invitation.manual_delivery_confirmed",
      "auth.invitation.resent",
      "auth.invitation.cancelled",
    ]) {
      expect(
        invitationAudit.find((event) => event.action === action)?.actorUserId,
      ).toBe(admin.userId);
    }
    expect(
      auth
        .getWebRoutes()
        .some((route) => route.path.startsWith("/auth/admin/")),
    ).toBe(true);
  });
});
