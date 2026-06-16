import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { DocumentPlugin, documentPlugin } from "../src";

describe("DocumentPlugin", () => {
  it("registers the document entity type", () => {
    const plugin = new DocumentPlugin();

    expect(plugin.entityType).toBe("document");
    expect(plugin.adapter.entityType).toBe("document");
  });

  it("factory returns a plugin", () => {
    expect(documentPlugin().id).toBe("document");
  });

  it("registers the manual document_generate tool", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    const capabilities = await harness.installPlugin(new DocumentPlugin());

    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "document_generate",
    ]);
  });

  it("registers a system_create interceptor for attachment-derived documents", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    expect(interceptor).toBeDefined();
  });

  it("handles system_create document from a source attachment by enqueueing generation", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    if (!interceptor) throw new Error("document interceptor not registered");

    const result = await interceptor(
      {
        entityType: "document",
        from: {
          kind: "entity-attachment",
          sourceEntityType: "deck",
          sourceEntityId: "deck-1",
          attachmentType: "carousel",
        },
        replace: true,
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      },
      { interfaceType: "test", userId: "test-user" },
    );

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: expect.any(String),
          jobId: expect.any(String),
          status: "generating",
          attachment: {
            mediaType: "application/pdf",
            url: expect.stringContaining("/api/chat/attachments/document?id="),
            downloadUrl: expect.stringContaining(
              "/api/chat/attachments/document?id=",
            ),
            filename: expect.stringMatching(/\.pdf$/),
            source: {
              entityType: "document",
              entityId: expect.any(String),
              attachmentType: "carousel",
            },
          },
        },
      },
    });
  });

  it("promotes an uploaded PDF into a durable document entity", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000101",
      });
    const record = await store.save({
      filename: "brief.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.4\n%EOF\n"),
    });
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    if (!interceptor) throw new Error("document interceptor not registered");

    const result = await interceptor(
      {
        entityType: "document",
        title: "Brief",
        from: { kind: "upload", id: record.ref.id },
      },
      { interfaceType: "web-chat", userId: "operator" },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "brief",
          status: "created",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=brief",
            downloadUrl: "/api/chat/attachments/document?id=brief&download=1",
            filename: "brief.pdf",
            source: {
              entityType: "document",
              entityId: "brief",
              attachmentType: "uploaded",
            },
          },
        },
      },
    });
    const entity = await harness.getEntityService().getEntity({
      entityType: "document",
      id: "brief",
    });
    expect(entity?.content).toBe(
      `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%EOF\n").toString("base64")}`,
    );
    expect(entity?.metadata).toMatchObject({
      title: "Brief",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      attachmentType: "uploaded",
    });
  });

  it("rejects non-PDF upload promotion to document", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000102",
      });
    const record = await store.save({
      filename: "notes.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    if (!interceptor) throw new Error("document interceptor not registered");

    const result = await interceptor(
      {
        entityType: "document",
        from: { kind: "upload", id: record.ref.id },
      },
      { interfaceType: "web-chat", userId: "operator" },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Only PDF uploads can be promoted to document entities",
      },
    });
  });

  it("returns an existing deduped document id for system_create attachment cards", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());
    harness.addEntities([
      {
        id: "post-1",
        entityType: "post",
        content: "---\ntitle: Post\n---\nBody",
        contentHash: "source-hash",
        metadata: { title: "Post" },
      },
      {
        id: "existing-printable",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0=",
        metadata: {
          filename: "post-printable.pdf",
          mimeType: "application/pdf",
          dedupKey: "printable:post:post-1:resolved-attachment:source-hash",
        },
      },
    ]);
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    if (!interceptor) throw new Error("document interceptor not registered");

    const result = await interceptor(
      {
        entityType: "document",
        from: {
          kind: "entity-attachment",
          sourceEntityType: "post",
          sourceEntityId: "post-1",
          attachmentType: "printable",
        },
      },
      { interfaceType: "test", userId: "test-user" },
    );

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "existing-printable",
          attachment: {
            url: "/api/chat/attachments/document?id=existing-printable",
            source: {
              entityType: "document",
              entityId: "existing-printable",
              attachmentType: "printable",
            },
          },
        },
      },
    });
  });

  it("returns a predicted PDF attachment for chat surfaces", async () => {
    const harness = createPluginHarness<DocumentPlugin>();
    await harness.installPlugin(new DocumentPlugin());

    const result = await harness.executeTool("document_generate", {
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
      documentId: "deck-carousel",
      filename: "deck-carousel.pdf",
    });

    expect(result).toEqual({
      success: true,
      data: {
        jobId: expect.any(String),
        documentId: "deck-carousel",
        attachment: {
          mediaType: "application/pdf",
          url: "/api/chat/attachments/document?id=deck-carousel",
          downloadUrl:
            "/api/chat/attachments/document?id=deck-carousel&download=1",
          filename: "deck-carousel.pdf",
          source: {
            entityType: "document",
            entityId: "deck-carousel",
            attachmentType: "carousel",
          },
        },
      },
    });
  });
});
