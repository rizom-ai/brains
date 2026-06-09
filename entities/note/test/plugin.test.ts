import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { NotePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { JobHandler } from "@brains/plugins";
import { ProgressReporter } from "@brains/utils";

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
        namespace: "web-chat",
        refKind: "web-chat-upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000701",
      });
      const upload = await uploadStore.save({
        filename: "research-notes.txt",
        mediaType: "text/plain",
        content: Buffer.from(
          "# Research Notes\n\nUseful extracted text.",
          "utf8",
        ),
      });
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("base");
      if (!interceptor) throw new Error("base create interceptor not found");

      const result = await interceptor(
        {
          entityType: "base",
          from: { kind: "web-chat-upload", id: upload.id },
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
        data: { uploadId: upload.id },
      });

      let entity = await harness.getEntityService().getEntity({
        entityType: "base",
        id: "research-notes",
      });
      expect(entity).toBeNull();

      await runQueuedUploadImport();

      entity = await harness.getEntityService().getEntity({
        entityType: "base",
        id: "research-notes",
      });
      expect(entity?.content).toContain("Useful extracted text.");
      expect(entity?.metadata).toMatchObject({ title: "research-notes" });
    });

    it("imports an uploaded JSON file as a markdown note", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "web-chat",
        refKind: "web-chat-upload",
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
        .getCreateInterceptor("base");
      if (!interceptor) throw new Error("base create interceptor not found");

      const result = await interceptor(
        {
          entityType: "base",
          from: { kind: "web-chat-upload", id: upload.id },
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
        entityType: "base",
        id: "config-export",
      });
      expect(entity?.content).toContain("useful value");
      expect(entity?.metadata).toMatchObject({ title: "config-export" });
    });

    it("rejects unsupported uploaded media for markdown import", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "web-chat",
        refKind: "web-chat-upload",
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
        .getCreateInterceptor("base");
      if (!interceptor) throw new Error("base create interceptor not found");

      const result = await interceptor(
        {
          entityType: "base",
          from: { kind: "web-chat-upload", id: upload.id },
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
        entityType: "base",
        id: "robot",
      });
      expect(entity).toBeNull();
    });

    it("imports an uploaded PDF as extracted markdown", async () => {
      const uploadStore = harness.getEntityContext("test").uploads.scoped({
        namespace: "web-chat",
        refKind: "web-chat-upload",
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
        .getCreateInterceptor("base");
      if (!interceptor) throw new Error("base create interceptor not found");

      const result = await interceptor(
        {
          entityType: "base",
          from: { kind: "web-chat-upload", id: upload.id },
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
        entityType: "base",
        id: "distributed-systems-primer",
      });
      expect(entity?.content).toContain("Distributed Systems Primer");
      expect(entity?.metadata).toMatchObject({
        title: "distributed-systems-primer",
      });
    });
  });
});
