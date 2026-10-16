import { describe, it, expect } from "bun:test";
import { createMockEntityPluginContext } from "@brains/test-utils";
import { createNewInstitutionsWhitepaper } from "../fixtures/whitepaper-entities";
import {
  buildPrintableContent,
  WhitepaperPrintableAttachmentProvider,
} from "../../src/attachments/printable-provider";
import { WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE } from "../../src/attachments/printable-template";

describe("WhitepaperPrintableAttachmentProvider", () => {
  it("builds printable content from whitepaper markdown", () => {
    const content = buildPrintableContent(createNewInstitutionsWhitepaper(), {
      brandLabel: "rizom.ai",
    });

    expect(content.title).toContain("New Institutions");
    expect(content.body).toContain("## Executive Summary");
    expect(content.thesis).toContain("New institutions need technology");
    expect(content.audience).toContain("public-interest technology builders");
    expect(content.brandLabel).toBe("rizom.ai");
  });

  it("renders a printable PDF attachment", async () => {
    const context = {
      ...createMockEntityPluginContext({
        returns: {
          entityService: {
            getEntity: createNewInstitutionsWhitepaper(),
          },
        },
      }),
      themeCSS: "",
    };
    const provider = new WhitepaperPrintableAttachmentProvider(context, {
      renderPdf: async (): Promise<Buffer> => Buffer.from("%PDF-1.4 mock"),
    });

    const result = await provider.resolve({
      sourceEntityType: "whitepaper",
      sourceEntityId: "new-institutions",
      attachmentType: WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE,
    });

    expect(result).toMatchObject({
      type: "document",
      mimeType: "application/pdf",
      filename: "new-institutions-printable.pdf",
    });
    expect(result?.data.toString()).toBe("%PDF-1.4 mock");
  });

  it("ignores unrelated source requests", async () => {
    const context = createMockEntityPluginContext();
    const provider = new WhitepaperPrintableAttachmentProvider(context, {
      renderPdf: async (): Promise<Buffer> => Buffer.from("%PDF-1.4 mock"),
    });

    const result = await provider.resolve({
      sourceEntityType: "post",
      sourceEntityId: "example",
      attachmentType: WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE,
    });

    expect(result).toBeUndefined();
  });
});
