import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { createTempDir } from "@brains/test-utils";
import { NotePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { EntityMutationResult, JobHandler } from "@brains/plugins";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { EntityFileRuntime, EntityBinaryClient } from "@brains/entity-service";

const webChatOperatorContext = {
  interfaceType: "web-chat",
  actor: { kind: "user" as const, userId: "operator" },
};

const primerPdfBase64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcyMCBUZCAoRGlzdHJpYnV0ZWQgU3lzdGVtcyBQcmltZXIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==";

describe("NotePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: NotePlugin;
  let capabilities: PluginCapabilities;
  let enqueuedJobs: Array<{ type: string; data: unknown; options?: unknown }>;
  let registeredHandlers: Map<string, JobHandler>;
  let files: EntityFileRuntime;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: await createTempDir("test-datadir-note-"),
    });
    const unexpected = (): never => {
      throw new Error("Unexpected native database operation");
    };
    const actor = new URL(
      "../../../shared/document/src/upload-markdown-process.ts",
      import.meta.url,
    );
    files = new EntityFileRuntime(
      new EntityBinaryClient({
        transport: {
          control: unexpected,
          publication: unexpected,
          invalidate: unexpected,
        },
      }),
      {
        executable: process.execPath,
        uploadUrl: actor,
        downloadUrl: actor,
        inspectionUploadUrl: actor,
        producerUrls: { "upload-markdown": actor },
      },
    );
    harness.getEntityService().fileAssets = files;
    enqueuedJobs = [];
    registeredHandlers = new Map();

    const shell = harness.getMockShell();
    const originalJobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): typeof originalJobQueue => ({
      ...originalJobQueue,
      enqueue: async (request): Promise<string> => {
        enqueuedJobs.push(request);
        return "queued-note-job";
      },
      registerHandler: (type, handler): void => {
        registeredHandlers.set(type, handler);
      },
      getHandler: (type) => registeredHandlers.get(type),
    });

    plugin = new NotePlugin({});
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(async () => {
    await files.close();
    await harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("note");
      expect(plugin.type).toBe("entity");
      expect(plugin.version).toBeDefined();
    });

    it("should not provide tools (entity creation via system_create)", () => {
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });

    it("registers public notes as primary topic sources", () => {
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("note"),
      ).toMatchObject({ projectionSourceRole: "primary" });
    });
  });

  async function runQueuedUploadImport(): Promise<unknown> {
    const handler = registeredHandlers.get("note:upload-import");
    if (!handler) throw new Error("note:upload-import handler not registered");
    const job = enqueuedJobs[0];
    if (!job) throw new Error("upload import job not queued");
    const reporter = CallbackProgressReporter.from(async () => {});
    if (!reporter) throw new Error("progress reporter not created");
    return handler.process(
      job.data,
      "queued-note-job",
      reporter,
      new AbortController().signal,
    );
  }

  describe("upload markdown imports", () => {
    async function pendingImport(): Promise<{
      uploadId: string;
      entityId: string;
      handler: JobHandler;
    }> {
      const store = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
      });
      const upload = await store.save({
        filename: "guarded.txt",
        mediaType: "text/plain",
        content: Buffer.from("Persisted once"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("Missing interceptor");
      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );
      if (result.kind !== "handled" || !result.result.success)
        throw new Error("Missing pending import");
      const handler = registeredHandlers.get("note:upload-import");
      if (!handler) throw new Error("Missing handler");
      const entityId = result.result.data.entityId;
      if (!entityId) throw new Error("Missing pending entity id");
      return {
        uploadId: upload.id,
        entityId,
        handler,
      };
    }

    it("does not rewrite a saved note after an uncertain mutation outcome", async () => {
      const pending = await pendingImport();
      const service = harness.getEntityService();
      const update = service.updateEntity.bind(service);
      const failure = new Error("mutation acknowledgement lost");
      let calls = 0;
      service.updateEntity = async (request): Promise<EntityMutationResult> => {
        calls++;
        await update(request);
        throw failure;
      };
      const reporter = CallbackProgressReporter.from(
        async (): Promise<void> => undefined,
      );
      if (!reporter) throw new Error("Missing reporter");
      await assert.rejects(
        pending.handler.process(
          { uploadId: pending.uploadId, entityId: pending.entityId },
          "uncertain-note",
          reporter,
          new AbortController().signal,
        ),
        (error: unknown) => error === failure,
      );
      expect(calls).toBe(1);
      const stored = await service.getEntity({
        entityType: "note",
        id: pending.entityId,
      });
      expect(stored?.content).toContain("Persisted once");
      expect(stored?.content).not.toContain("status: failed");
      expect(enqueuedJobs[0]?.options).toMatchObject({ maxRetries: 0 });
    });

    it("preserves distinct extraction and pending-update failures", async () => {
      const pending = await pendingImport();
      const primary = new Error("extraction failed");
      const cleanup = new Error("failure update failed");
      files.withProducedFile = async (): Promise<never> => {
        throw primary;
      };
      harness.getEntityService().updateEntity = async (): Promise<never> => {
        throw cleanup;
      };
      const reporter = CallbackProgressReporter.from(
        async (): Promise<void> => undefined,
      );
      if (!reporter) throw new Error("Missing reporter");
      await assert.rejects(
        pending.handler.process(
          { uploadId: pending.uploadId, entityId: pending.entityId },
          "failed-note",
          reporter,
          new AbortController().signal,
        ),
        (error: unknown) => {
          expect(error).toBeInstanceOf(AggregateError);
          if (!(error instanceof AggregateError)) return false;
          expect(error.errors[0]).toBe(primary);
          expect(error.errors[1]).toBe(cleanup);
          expect(error.cause).toBe(primary);
          return true;
        },
      );
    });

    it("pre-abort leaves the pending note untouched", async () => {
      const pending = await pendingImport();
      const service = harness.getEntityService();
      const before = await service.getEntity({
        entityType: "note",
        id: pending.entityId,
      });
      const reporter = CallbackProgressReporter.from(
        async (): Promise<void> => undefined,
      );
      if (!reporter) throw new Error("Missing reporter");
      const failure = new Error("cancelled");
      await assert.rejects(
        pending.handler.process(
          { uploadId: pending.uploadId, entityId: pending.entityId },
          "cancelled-note",
          reporter,
          AbortSignal.abort(failure),
        ),
        (error: unknown) => error === failure,
      );
      expect(
        (await service.getEntity({ entityType: "note", id: pending.entityId }))
          ?.content,
      ).toBe(before?.content);
    });

    it("queues an uploaded text file import as a markdown note", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000701",
      });
      const rawMarkdown = [
        "# Research Notes",
        "",
        "Do not summarize this imported source.",
        "",
        "- First detailed observation stays intact.",
        "- Second detailed observation stays intact.",
      ].join("\n");
      const upload = await uploadStore.save({
        filename: "research-notes.txt",
        mediaType: "text/plain",
        content: Buffer.from(rawMarkdown, "utf8"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          visibility: "shared",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );

      expect(result.kind).toBe("handled");
      if (result.kind !== "handled") return;
      if (!result.result.success) throw new Error(result.result.error);
      expect(result.result.data).toEqual({
        entityId: "research-notes",
        status: "generating",
        jobId: "queued-note-job",
      });
      expect(enqueuedJobs).toHaveLength(1);
      expect(enqueuedJobs[0]).toMatchObject({
        type: "note:upload-import",
        data: { uploadId: upload.id, entityId: "research-notes" },
      });

      let entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "research-notes",
        visibilityScope: "shared",
      });
      expect(entity?.metadata).toMatchObject({
        title: "research-notes",
        status: "generating",
      });
      expect(entity?.visibility).toBe("shared");

      await runQueuedUploadImport();

      entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "research-notes",
        visibilityScope: "shared",
      });
      expect(entity?.content).toBe(
        `---\ntitle: research-notes\n---\n${rawMarkdown}\n`,
      );
      expect(entity?.metadata).toEqual({ title: "research-notes" });
      expect(entity?.visibility).toBe("shared");
    });

    it("does not overwrite a note edited while its upload import is queued", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000707",
      });
      const upload = await uploadStore.save({
        filename: "launch-plan.md",
        mediaType: "text/markdown",
        content: Buffer.from("# Launch Plan\n\nLaunch day: Monday.", "utf8"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        {
          interfaceType: "web-chat",
          actor: { kind: "user", userId: "operator" },
        },
      );
      expect(result.kind).toBe("handled");

      const entityService = harness.getEntityService();
      const stub = await entityService.getEntity({
        entityType: "note",
        id: "launch-plan",
      });
      if (!stub) throw new Error("note import stub not found");
      const editedContent = "# Launch Plan\n\nLaunch day: Friday.\n";
      await entityService.updateEntity({
        entity: {
          ...stub,
          content: editedContent,
          metadata: { title: "Launch Plan" },
        },
      });

      const current = await entityService.getEntity({
        entityType: "note",
        id: "launch-plan",
      });
      expect(current?.contentHash).not.toBe(stub.contentHash);
      expect(enqueuedJobs[0]).toMatchObject({
        data: { stubContentHash: stub.contentHash },
      });

      const importResult = await runQueuedUploadImport();

      expect(importResult).toEqual({
        entityId: "launch-plan",
        status: "superseded",
      });
      const edited = await entityService.getEntity({
        entityType: "note",
        id: "launch-plan",
      });
      expect(edited?.content).toContain("Launch day: Friday.");
      expect(edited?.content).not.toContain("Launch day: Monday.");
    });

    it("imports an uploaded JSON file as a markdown note", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000703",
      });
      const upload = await uploadStore.save({
        filename: "config-export.json",
        mediaType: "application/json",
        content: Buffer.from('{\n  "key": "useful value"\n}', "utf8"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );

      expect(result.kind).toBe("handled");
      if (result.kind !== "handled") return;
      if (!result.result.success) throw new Error(result.result.error);
      expect(result.result.data).toEqual({
        entityId: "config-export",
        status: "generating",
        jobId: "queued-note-job",
      });

      await runQueuedUploadImport();

      const entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "config-export",
      });
      expect(entity?.content).toContain("useful value");
      expect(entity?.metadata).toMatchObject({ title: "config-export" });
    });

    it("rejects unsupported uploaded media for markdown import", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000704",
      });
      const upload = await uploadStore.save({
        filename: "robot.png",
        mediaType: "image/png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );

      expect(result.kind).toBe("handled");
      if (result.kind !== "handled") return;
      expect(result.result).toEqual({
        success: false,
        error:
          "Only text, JSON, and PDF uploads can be imported as markdown notes",
      });
      expect(enqueuedJobs).toHaveLength(0);
      const entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "robot",
      });
      expect(entity).toBeNull();
    });

    it("imports an uploaded PDF as extracted markdown", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000702",
      });
      const upload = await uploadStore.save({
        filename: "distributed-systems-primer.pdf",
        mediaType: "application/pdf",
        content: Buffer.from(primerPdfBase64, "base64"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );

      expect(result.kind).toBe("handled");
      if (result.kind !== "handled") return;
      if (!result.result.success) throw new Error(result.result.error);
      expect(result.result.data).toEqual({
        entityId: "distributed-systems-primer",
        status: "generating",
        jobId: "queued-note-job",
      });

      await runQueuedUploadImport();

      const entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "distributed-systems-primer",
      });
      expect(entity?.content).toContain("Distributed Systems Primer");
      expect(entity?.metadata).toMatchObject({
        title: "distributed-systems-primer",
      });
    });

    it("returns the deduplicated entityId when the derived id is taken", async () => {
      const entityService = harness.getEntityService();
      const now = new Date().toISOString();
      await entityService.createEntity({
        entity: {
          id: "research-notes",
          entityType: "note",
          content: "# Existing\n\nOriginal note body",
          metadata: { title: "Existing" },
          created: now,
          updated: now,
        },
      });
      // The mock entity service ignores deduplicateId — emulate the real
      // service's suffix resolution so the interceptor sees a resolved id.
      const originalCreate = entityService.createEntity.bind(entityService);
      entityService.createEntity = async (
        request,
      ): Promise<EntityMutationResult> => {
        const { entity } = request;
        const existing =
          entity.id && entity.entityType
            ? await entityService.getEntity({
                entityType: entity.entityType,
                id: entity.id,
              })
            : null;
        if (existing) {
          return originalCreate({
            ...request,
            entity: { ...entity, id: `${entity.id}-2` },
          });
        }
        return originalCreate(request);
      };

      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000705",
      });
      const upload = await uploadStore.save({
        filename: "research-notes.txt",
        mediaType: "text/plain",
        content: Buffer.from("Fresh imported body", "utf8"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );

      expect(result.kind).toBe("handled");
      if (result.kind !== "handled") return;
      if (!result.result.success) throw new Error(result.result.error);
      expect(result.result.data).toEqual({
        entityId: "research-notes-2",
        status: "generating",
        jobId: "queued-note-job",
      });
      expect(enqueuedJobs[0]).toMatchObject({
        type: "note:upload-import",
        data: { uploadId: upload.id, entityId: "research-notes-2" },
      });

      await runQueuedUploadImport();

      const imported = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "research-notes-2",
      });
      expect(imported?.content).toContain("Fresh imported body");

      const original = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "research-notes",
      });
      expect(original?.content).toContain("Original note body");
    });

    it("marks the stub failed when the import job fails", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000706",
      });
      const upload = await uploadStore.save({
        filename: "doomed-import.txt",
        mediaType: "text/plain",
        content: Buffer.from("Body", "utf8"),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("note");
      if (!interceptor) throw new Error("note create interceptor not found");

      const result = await interceptor(
        {
          entityType: "note",
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        webChatOperatorContext,
      );
      expect(result.kind).toBe("handled");

      const handler = registeredHandlers.get("note:upload-import");
      if (!handler) {
        throw new Error("note:upload-import handler not registered");
      }
      const reporter = CallbackProgressReporter.from(async () => {});
      if (!reporter) throw new Error("progress reporter not created");
      await assert.rejects(
        handler.process(
          { uploadId: "missing-upload", entityId: "doomed-import" },
          "queued-note-job",
          reporter,
          new AbortController().signal,
        ),
      );

      const entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "doomed-import",
      });
      expect(entity?.metadata).toMatchObject({ status: "failed" });
      expect(entity?.metadata["error"]).toBeDefined();
    });
  });
});
