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
