import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type {
  CreateExecutionContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { createServicePluginContext } from "@brains/plugins";
import { PermissionService } from "@brains/templates";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { CmsWorkspaceRegistry } from "../src/workspace-registry";

const trustedPrincipal: AuthPrincipal = {
  userId: "usr_uploader",
  personId: "person_uploader",
  displayName: "Trusted uploader",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  isAnchor: false,
  canonicalId: "user:trusted-uploader",
};

async function setup(): Promise<{
  dataDir: string;
  shell: ReturnType<typeof createMockShell>;
  uploadRoute: WebRouteDefinition;
  auditEvents: AppendAuthAuditEventInput[];
}> {
  const dataDir = await createTempDataDir("brains-cms-upload-policy-");
  const shell = createMockShell({ domain: "yeehaa.io", dataDir });
  const permissions = new PermissionService({
    entityActions: {
      "*": { create: "admin" },
      image: { create: "trusted" },
    },
  });
  shell.getPermissionService = (): PermissionService => permissions;
  const context = createServicePluginContext(shell, "cms");
  const auditEvents: AppendAuthAuditEventInput[] = [];
  const routes = createEditorRoutes({
    routePath: "/cms",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> => trustedPrincipal,
    minimumPermissionLevel: "trusted",
    getEntityDisplay: () => undefined,
    workspaceRegistry: new CmsWorkspaceRegistry(),
    recordAuditEvent: async (event) => {
      auditEvents.push(event);
    },
  });
  const uploadRoute = routes.find(
    (candidate) =>
      candidate.path === "/cms/api/upload" && candidate.method === "POST",
  );
  if (!uploadRoute) throw new Error("Missing CMS upload route");
  return { dataDir, shell, uploadRoute, auditEvents };
}

function uploadRequest(): Request {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array([1, 2, 3])], "image.png", {
      type: "image/png",
    }),
  );
  return new Request("https://yeehaa.io/cms/api/upload", {
    method: "POST",
    headers: { Origin: "https://yeehaa.io" },
    body: form,
  });
}

async function temporaryUploads(dataDir: string): Promise<string[]> {
  return readdir(join(dataDir, "upload", "uploads")).catch(() => []);
}

describe("CMS upload policy", () => {
  it("enforces the handler target create policy before promotion", async () => {
    const fixture = await setup();
    let promotions = 0;
    fixture.shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "secret-image",
      mediaTypes: ["image/*"],
      handler: async () => {
        promotions += 1;
        return {
          success: true,
          data: { entityId: "secret-image", status: "created" },
        };
      },
    });

    const response = await fixture.uploadRoute.handler(uploadRequest());

    expect(response.status).toBe(403);
    const body = z.object({ error: z.string() }).parse(await response.json());
    expect(body.error).toContain("secret-image");
    expect(promotions).toBe(0);
    expect(await temporaryUploads(fixture.dataDir)).toEqual([]);
    expect(fixture.auditEvents).toEqual([
      {
        actorUserId: trustedPrincipal.userId,
        action: "cms.entity.upload.denied",
        targetType: "entity",
        metadata: {
          entityType: "secret-image",
          interfaceType: "cms",
          outcome: "denied",
          reason: "entity-action-policy",
        },
      },
    ]);
  });

  it("promotes with the authenticated actor when create policy allows", async () => {
    const fixture = await setup();
    let executionContext: CreateExecutionContext | undefined;
    fixture.shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: async (_input, context) => {
        executionContext = context;
        return {
          success: true,
          data: { entityId: "image-1", status: "created" },
        };
      },
    });

    const response = await fixture.uploadRoute.handler(uploadRequest());

    expect(response.status).toBe(201);
    expect(executionContext).toEqual({
      interfaceType: "cms",
      actor: {
        kind: "user",
        userId: trustedPrincipal.userId,
        canonicalId: trustedPrincipal.canonicalId,
      },
    });
    expect(fixture.auditEvents).toEqual([
      {
        actorUserId: trustedPrincipal.userId,
        action: "cms.entity.upload.allowed",
        targetType: "entity",
        targetId: "image-1",
        metadata: {
          entityType: "image",
          interfaceType: "cms",
          outcome: "allowed",
        },
      },
    ]);
  });

  it("cleans temporary bytes when promotion fails or throws", async () => {
    const failures: readonly ("result" | "throw")[] = ["result", "throw"];
    for (const failure of failures) {
      const fixture = await setup();
      let promotions = 0;
      fixture.shell.getEntityRegistry().registerUploadSaveHandler({
        entityType: "image",
        mediaTypes: ["image/*"],
        handler: async () => {
          promotions += 1;
          if (failure === "throw") throw new Error("Promotion crashed");
          return { success: false, error: "Promotion refused" };
        },
      });

      const response = await fixture.uploadRoute.handler(uploadRequest());

      expect(response.status).toBe(502);
      expect(promotions).toBe(1);
      expect(await temporaryUploads(fixture.dataDir)).toEqual([]);
    }
  });
});
