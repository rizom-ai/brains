import { describe, expect, it, spyOn } from "bun:test";
import { createTempDir } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { createPdfDataUrl } from "@brains/document";
import { documentPlugin, type DocumentEntityPlugin } from "./document-plugin";

describe("DocumentPlugin", () => {
  it("registers the document entity type", () => {
    const plugin = documentPlugin();

    expect(plugin.entityType).toBe("document");
    expect(plugin.adapter.entityType).toBe("document");
  });

  it("factory returns a plugin", () => {
    expect(documentPlugin().id).toBe("document");
  });

  it("does not expose document_generate as a competing model-visible tool", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>();
    const capabilities = await harness.installPlugin(documentPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("document").binaryStorage,
    ).toBe("data-url");
    expect(capabilities.tools.map((tool) => tool.name)).not.toContain(
      "document_generate",
    );
  });

  it("registers a system_create interceptor for attachment-derived documents", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>();
    await harness.installPlugin(documentPlugin());

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("document");
    expect(interceptor).toBeDefined();
  });

  it("registers a PDF upload-save handler", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>();
    await harness.installPlugin(documentPlugin());

    const registration = harness
      .getEntityRegistry()
      .getUploadSaveHandler("application/pdf");
    expect(registration?.entityType).toBe("document");
  });

  it("handles system_create document from a source attachment by enqueueing generation", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>({
      dataDir: await createTempDir("test-document-source-"),
    });
    await harness.installPlugin(documentPlugin());
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
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "test-user" },
      },
    );

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected handled success");
    }
    const entityId = result.result.data.entityId;
    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId,
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
              entityId,
              attachmentType: "carousel",
            },
          },
        },
      },
    });
    const documents = await harness.getEntityService().listEntities({
      entityType: "document",
    });
    const pending = documents.find((document) => document.id === entityId);
    expect(pending?.metadata).toMatchObject({
      status: "pending",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });
  });

  it("promotes an uploaded PDF into a durable document entity", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>({
      dataDir: await createTempDir("test-document-upload-"),
    });
    await harness.installPlugin(documentPlugin());
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
    const createSpy = spyOn(harness.getEntityService(), "createEntity");
    const registration = harness
      .getEntityRegistry()
      .getUploadSaveHandler("application/pdf");
    if (!registration)
      throw new Error("document upload handler not registered");

    const result = await registration.handler(
      {
        title: "Brief",
        visibility: "shared",
        upload: { kind: "upload", id: record.ref.id },
      },
      {
        interfaceType: "web-chat",
        actor: { kind: "user", userId: "operator" },
      },
    );

    expect(result).toEqual({
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
    });
    const entity = await harness.getEntityService().getEntity({
      entityType: "document",
      id: "brief",
      visibilityScope: "shared",
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
    expect(entity?.visibility).toBe("shared");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          eventContext: {
            actor: { kind: "user", userId: "operator" },
            interfaceType: "web-chat",
          },
        }),
      }),
    );
  });

  it("rejects non-PDF upload promotion to document", async () => {
    const harness = createPluginHarness<DocumentEntityPlugin>({
      dataDir: await createTempDir("test-document-upload-"),
    });
    await harness.installPlugin(documentPlugin());
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
      {
        interfaceType: "web-chat",
        actor: { kind: "user", userId: "operator" },
      },
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
    const harness = createPluginHarness<DocumentEntityPlugin>();
    await harness.installPlugin(documentPlugin());
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
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "test-user" },
      },
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
});

describe("the document adapter", () => {
  const pdfDataUrl = createPdfDataUrl(Buffer.from("%PDF-1.7\n%test"));

  it("validates raw PDF content and leaves metadata to the import pipeline", () => {
    const partial = documentPlugin().adapter.fromMarkdown(pdfDataUrl);

    expect(partial.entityType).toBe("document");
    expect(partial.content).toBe(pdfDataUrl);
    // metadata is intentionally absent: filename/mimeType/dedupKey/source
    // provenance come from the directory-sync sidecar, not from the bytes.
    expect(partial.metadata).toBeUndefined();
  });

  it("rejects non-PDF content via fromMarkdown", () => {
    expect(() =>
      documentPlugin().adapter.fromMarkdown("data:text/plain;base64,aGVsbG8="),
    ).toThrow("Invalid PDF document data URL");
  });

  it("stores its PDF data URL as it is, with no frontmatter", () => {
    expect(
      documentPlugin().adapter.toMarkdown({
        id: "doc-1",
        entityType: "document",
        content: pdfDataUrl,
        contentHash: "hash",
        visibility: "public",
        metadata: { mimeType: "application/pdf", filename: "doc-1.pdf" },
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(pdfDataUrl);
  });
});
