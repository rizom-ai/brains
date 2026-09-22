import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { createMockShell, createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { AcknowledgedRuntimeUploadError } from "@brains/plugins";
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

import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { provisionUploadCapture } from "./upload-file-fixture";

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
  const dataDir = await createTempDataDir("brains-studio-upload-policy-");
  const shell = createMockShell({ domain: "yeehaa.io", dataDir });
  provisionUploadCapture(shell.getEntityService());
  const permissions = new PermissionService({
    entityActions: {
      "*": { create: "admin" },
      image: { create: "trusted" },
    },
  });
  shell.getPermissionService = (): PermissionService => permissions;
  const context = createServicePluginContext(shell, "studio");
  const auditEvents: AppendAuthAuditEventInput[] = [];
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> => trustedPrincipal,
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
    recordAuditEvent: async (event) => {
      auditEvents.push(event);
    },
  });
  const uploadRoute = routes.find(
    (candidate) =>
      candidate.path === "/studio/api/upload" && candidate.method === "POST",
  );
  if (!uploadRoute) throw new Error("Missing Studio upload route");
  return { dataDir, shell, uploadRoute, auditEvents };
}

function uploadRequest(): Request {
  const request = new Request("https://yeehaa.io/studio/api/upload", {
    method: "POST",
    headers: {
      Origin: "https://yeehaa.io",
      "Content-Type": "image/png",
      "X-Upload-Filename": "image.png",
    },
    body: new Uint8Array([1, 2, 3]),
  });
  const forbidden = async (): Promise<never> => {
    throw new Error("Controller payload materialization forbidden");
  };
  request.formData = forbidden;
  request.arrayBuffer = forbidden;
  request.blob = forbidden;
  return request;
}

async function temporaryUploads(dataDir: string): Promise<string[]> {
  return readdir(join(dataDir, "upload", "uploads")).catch(() => []);
}

describe("Studio upload policy", () => {
  it("does not promote an acknowledged capture after retirement failure", async () => {
    const fixture = await setup();
    let promotions = 0;
    fixture.shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: async () => {
        promotions++;
        return {
          success: true,
          data: { entityId: "image-1", status: "created" },
        };
      },
    });
    const files = fixture.shell.getEntityService().fileAssets;
    const capture = files?.withCapturedFile;
    if (!files || !capture) throw new Error("Missing capture fixture");
    const failure = new Error("Native capture retirement failed");
    files.withCapturedFile = async (
      input,
      use,
      options,
    ): ReturnType<typeof use> => {
      await capture(input, use, options);
      throw failure;
    };
    await assert.rejects(
      async (): Promise<Response> =>
        fixture.uploadRoute.handler(uploadRequest()),
      (error: unknown) => {
        expect(error).toBeInstanceOf(AcknowledgedRuntimeUploadError);
        if (!(error instanceof AcknowledgedRuntimeUploadError)) return false;
        expect(error.cause).toBe(failure);
        expect(error.record.sizeBytes).toBe(3);
        return true;
      },
    );
    expect(promotions).toBe(0);
    expect(await temporaryUploads(fixture.dataDir)).toHaveLength(1);
    expect(fixture.auditEvents).toEqual([]);
  });

  it("fails closed without capture provisioning", async () => {
    const fixture = await setup();
    delete fixture.shell.getEntityService().fileAssets;
    let promotions = 0;
    fixture.shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: async () => {
        promotions++;
        return {
          success: true,
          data: { entityId: "image-1", status: "created" },
        };
      },
    });
    await assert.rejects(
      async (): Promise<Response> =>
        fixture.uploadRoute.handler(uploadRequest()),
      /not provisioned/,
    );
    expect(promotions).toBe(0);
    expect(await temporaryUploads(fixture.dataDir)).toEqual([]);
  });
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
        action: "studio.entity.upload.denied",
        targetType: "entity",
        metadata: {
          entityType: "secret-image",
          interfaceType: "studio",
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
      interfaceType: "studio",
      actor: {
        kind: "user",
        userId: trustedPrincipal.userId,
        canonicalId: trustedPrincipal.canonicalId,
      },
    });
    expect(fixture.auditEvents).toEqual([
      {
        actorUserId: trustedPrincipal.userId,
        action: "studio.entity.upload.allowed",
        targetType: "entity",
        targetId: "image-1",
        metadata: {
          entityType: "image",
          interfaceType: "studio",
          outcome: "allowed",
        },
      },
    ]);
  });

  it("retains recovery bytes when promotion fails or its outcome is unknown", async () => {
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
      expect(await temporaryUploads(fixture.dataDir)).toHaveLength(1);
    }
  });
});
