import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { NotePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { EntityMutationResult, JobHandler } from "@brains/plugins";
import { ProgressReporter } from "@brains/utils/progress";

const primerPdfBase64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcyMCBUZCAoRGlzdHJpYnV0ZWQgU3lzdGVtcyBQcmltZXIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==";

describe("NotePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: NotePlugin;
  let capabilities: PluginCapabilities;
  let enqueuedJobs: Array<{ type: string; data: unknown; options?: unknown }>;
  let registeredHandlers: Map<string, JobHandler>;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-datadir-${crypto.randomUUID()}`,
    });
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

  afterEach(() => {
    harness.reset();
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
  });

  async function runQueuedUploadImport(): Promise<void> {
    const handler = registeredHandlers.get("note:upload-import");
    if (!handler) throw new Error("note:upload-import handler not registered");
    const job = enqueuedJobs[0];
    if (!job) throw new Error("upload import job not queued");
    const reporter = ProgressReporter.from(async () => {});
    if (!reporter) throw new Error("progress reporter not created");
    await handler.process(job.data, "queued-note-job", reporter);
  }

  describe("upload markdown imports", () => {
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
          from: { kind: "upload", id: upload.id },
          transform: "extract-markdown",
        },
        { interfaceType: "web-chat", userId: "operator" },
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
      });
      expect(entity?.metadata).toMatchObject({
        title: "research-notes",
        status: "generating",
      });

      await runQueuedUploadImport();

      entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "research-notes",
      });
      expect(entity?.content).toBe(
        `---\ntitle: research-notes\n---\n${rawMarkdown}\n`,
      );
      expect(entity?.metadata).toEqual({ title: "research-notes" });
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
        { interfaceType: "web-chat", userId: "operator" },
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
        { interfaceType: "web-chat", userId: "operator" },
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
        { interfaceType: "web-chat", userId: "operator" },
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
        { interfaceType: "web-chat", userId: "operator" },
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
        { interfaceType: "web-chat", userId: "operator" },
      );
      expect(result.kind).toBe("handled");

      const handler = registeredHandlers.get("note:upload-import");
      if (!handler) {
        throw new Error("note:upload-import handler not registered");
      }
      const reporter = ProgressReporter.from(async () => {});
      if (!reporter) throw new Error("progress reporter not created");
      const jobResult = await handler.process(
        { uploadId: "missing-upload", entityId: "doomed-import" },
        "queued-note-job",
        reporter,
      );
      expect(jobResult).toMatchObject({ success: false });

      const entity = await harness.getEntityService().getEntity({
        entityType: "note",
        id: "doomed-import",
      });
      expect(entity?.metadata).toMatchObject({ status: "failed" });
      expect(
        (entity?.metadata as Record<string, unknown>)["error"],
      ).toBeDefined();
    });
  });
});
