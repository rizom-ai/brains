import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { NotePlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

const primerPdfBase64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcyMCBUZCAoRGlzdHJpYnV0ZWQgU3lzdGVtcyBQcmltZXIpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDE4CiUlRU9GCg==";

describe("NotePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: NotePlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

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

  describe("upload markdown imports", () => {
    it("imports an uploaded text file as a markdown note", async () => {
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
      expect(result.result.data.entityId).toBe("research-notes");

      const entity = await harness.getEntityService().getEntity({
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
      expect(result.result.data.entityId).toBe("config-export");

      const entity = await harness.getEntityService().getEntity({
        entityType: "base",
        id: "config-export",
      });
      expect(entity?.content).toContain("useful value");
      expect(entity?.metadata).toMatchObject({ title: "config-export" });
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
      expect(result.result.data.entityId).toBe("distributed-systems-primer");

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
