import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type { StudioWorkspaceActor, WebRouteDefinition } from "@brains/plugins";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const principal: AuthPrincipal = {
  userId: "usr_workspace_editor",
  personId: "person_workspace_editor",
  displayName: "Workspace editor",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  isAnchor: true,
  canonicalId: "user:workspace-editor",
};

const publicPrincipal: AuthPrincipal = {
  userId: "usr_public_workspace",
  personId: "person_public_workspace",
  displayName: "Public member",
  role: "public",
  status: "active",
  permissionLevel: "public",
  isAnchor: false,
};

function setup(resolvedPrincipal: AuthPrincipal = principal): {
  routes: WebRouteDefinition[];
  registry: StudioWorkspaceRegistry;
  actors: StudioWorkspaceActor[];
  privateCalls: { data: number; action: number };
} {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const context = createServicePluginContext(shell, "studio");
  const registry = new StudioWorkspaceRegistry();
  const actors: StudioWorkspaceActor[] = [];
  const privateCalls = { data: 0, action: 0 };
  registry.register({
    id: "trusted-workspace",
    pluginId: "test-provider",
    label: "Trusted workspace",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 10,
    accessHandler: (actor) => actor.userPermissionLevel === "trusted",
    dataProvider: async (actor) => {
      actors.push(actor);
      return { scope: actor.visibilityScope };
    },
    actionHandler: async (action, actor) => {
      actors.push(actor);
      return { action };
    },
  });
  registry.register({
    id: "admin-workspace",
    pluginId: "private-provider",
    label: "Admin workspace",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 20,
    accessHandler: (actor) => actor.userPermissionLevel === "admin",
    dataProvider: async () => {
      privateCalls.data += 1;
      return { private: true };
    },
    actionHandler: async () => {
      privateCalls.action += 1;
      return { private: true };
    },
  });
  return {
    actors,
    privateCalls,
    registry,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      resolveAuthPrincipal: async () => resolvedPrincipal,
      getEntityDisplay: () => undefined,
      workspaceRegistry: registry,
    }),
  };
}

function route(
  routes: WebRouteDefinition[],
  method: "GET" | "POST",
): WebRouteDefinition {
  const found = routes.find(
    (candidate) =>
      candidate.path === "/studio/api/workspace" && candidate.method === method,
  );
  if (!found) throw new Error(`Missing ${method} workspace route`);
  return found;
}

function actionRequest(id: string): Request {
  return new Request("https://yeehaa.io/studio/api/workspace", {
    method: "POST",
    headers: {
      Origin: "https://yeehaa.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, action: { type: "arrange" } }),
  });
}

const expectedActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: principal.userId,
  actor: {
    kind: "user",
    userId: principal.userId,
    canonicalId: "user:workspace-editor",
  },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: true,
};

describe("Studio workspace access", () => {
  it("filters descriptors through provider admission", async () => {
    const fixture = setup();
    const types = fixture.routes.find(
      (candidate) =>
        candidate.path === "/studio/api/types" && candidate.method === "GET",
    );
    if (!types) throw new Error("Missing Studio types route");

    const response = await types.handler(
      new Request("https://yeehaa.io/studio/api/types"),
    );
    const body = await response.json();

    expect(body).toMatchObject({
      workspaces: [{ id: "studio:account" }, { id: "trusted-workspace" }],
    });
    expect(JSON.stringify(body)).not.toContain("admin-workspace");
    expect(fixture.privateCalls.data).toBe(0);
  });

  it("admits an active Public actor only to an explicitly lowered workspace", async () => {
    const fixture = setup(publicPrincipal);
    fixture.registry.register({
      id: "account-workspace",
      pluginId: "account-provider",
      label: "Account",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 1,
      permission: "public",
      accessHandler: () => true,
      dataProvider: async (actor) => ({
        permission: actor.userPermissionLevel,
      }),
      actionHandler: async (_request, actor) => ({
        permission: actor.userPermissionLevel,
      }),
    });

    const types = fixture.routes.find(
      (candidate) =>
        candidate.path === "/studio/api/types" && candidate.method === "GET",
    );
    if (!types) throw new Error("Missing Studio types route");
    const navigation = await types.handler(
      new Request("https://yeehaa.io/studio/api/types"),
    );
    expect(await navigation.json()).toMatchObject({
      types: [],
      workspaces: [{ id: "studio:account" }, { id: "account-workspace" }],
    });

    const read = await route(fixture.routes, "GET").handler(
      new Request(
        "https://yeehaa.io/studio/api/workspace?id=account-workspace",
      ),
    );
    const action = await route(fixture.routes, "POST").handler(
      actionRequest("account-workspace"),
    );

    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      workspace: { data: { permission: "public" } },
    });
    expect(action.status).toBe(200);
    expect(await action.json()).toEqual({ result: { permission: "public" } });
  });

  it("passes the real actor to admitted reads and actions", async () => {
    const fixture = setup();
    const read = await route(fixture.routes, "GET").handler(
      new Request(
        "https://yeehaa.io/studio/api/workspace?id=trusted-workspace",
      ),
    );
    const action = await route(fixture.routes, "POST").handler(
      actionRequest("trusted-workspace"),
    );

    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      workspace: { data: { scope: "shared" } },
    });
    expect(action.status).toBe(200);
    expect(fixture.actors).toEqual([expectedActor, expectedActor]);
  });

  it("returns 404 before denied provider code", async () => {
    const fixture = setup();
    const read = await route(fixture.routes, "GET").handler(
      new Request("https://yeehaa.io/studio/api/workspace?id=admin-workspace"),
    );
    const action = await route(fixture.routes, "POST").handler(
      actionRequest("admin-workspace"),
    );

    expect(read.status).toBe(404);
    expect(action.status).toBe(404);
    expect(fixture.privateCalls).toEqual({ data: 0, action: 0 });
  });
});
