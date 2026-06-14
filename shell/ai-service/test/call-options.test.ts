import { describe, expect, test } from "bun:test";
import {
  buildBrainCallOptions,
  shouldDisableDocumentGenerate,
  shouldEnableCreateSourceAttachment,
  shouldDisableSystemCreateForUploadRead,
  shouldDisableSystemCreateForSavedAgentContact,
} from "../src/call-options";

describe("shouldEnableCreateSourceAttachment", () => {
  test("enables for artifact requests without accessible uploads", () => {
    expect(
      shouldEnableCreateSourceAttachment({
        message: "make a carousel for my deck",
        hasAccessibleUploads: false,
      }),
    ).toBe(true);
  });

  test("stays disabled for plain conversation", () => {
    expect(
      shouldEnableCreateSourceAttachment({
        message: "what did I write yesterday?",
        hasAccessibleUploads: false,
      }),
    ).toBe(false);
  });

  test("prefers uploads when the message does not reference an existing source", () => {
    expect(
      shouldEnableCreateSourceAttachment({
        message: "attach this pdf",
        hasAccessibleUploads: true,
      }),
    ).toBe(false);
  });

  test("enables despite uploads when an existing source is referenced", () => {
    expect(
      shouldEnableCreateSourceAttachment({
        message: "save a pdf of my deck",
        hasAccessibleUploads: true,
      }),
    ).toBe(true);
  });

  test("stays disabled for deck carousel preview-only requests", () => {
    expect(
      shouldEnableCreateSourceAttachment({
        message: "render a carousel preview of my deck",
        hasAccessibleUploads: false,
      }),
    ).toBe(false);
  });
});

describe("shouldDisableDocumentGenerate", () => {
  test("disables generation for durable source-derived artifact requests", () => {
    expect(shouldDisableDocumentGenerate("save a pdf of my deck")).toBe(true);
  });

  test("keeps generation for preview-only deck carousel requests", () => {
    expect(
      shouldDisableDocumentGenerate("render a carousel preview of my deck"),
    ).toBe(false);
  });

  test("keeps generation for artifact requests without an existing source", () => {
    expect(shouldDisableDocumentGenerate("create a pdf summary")).toBe(false);
  });

  test("keeps generation for plain conversation", () => {
    expect(shouldDisableDocumentGenerate("hello there")).toBe(false);
  });
});

describe("shouldDisableSystemCreateForUploadRead", () => {
  test("disables create for read-only uploaded PDF summaries", () => {
    expect(
      shouldDisableSystemCreateForUploadRead({
        message: "Summarize the uploaded PDF.",
        hasAccessibleUploads: true,
      }),
    ).toBe(true);
  });

  test("keeps create available for explicit uploaded file saves", () => {
    expect(
      shouldDisableSystemCreateForUploadRead({
        message: "Save the uploaded PDF as a document.",
        hasAccessibleUploads: true,
      }),
    ).toBe(false);
  });

  test("keeps create available when uploads are not accessible", () => {
    expect(
      shouldDisableSystemCreateForUploadRead({
        message: "Summarize the uploaded PDF.",
        hasAccessibleUploads: false,
      }),
    ).toBe(false);
  });
});

describe("shouldDisableSystemCreateForSavedAgentContact", () => {
  test("disables create for exact saved-agent contact requests", () => {
    expect(
      shouldDisableSystemCreateForSavedAgentContact(
        "Can you ask docs.rizom.ai for help? I want to know how to set up a new rover",
      ),
    ).toBe(true);
  });

  test("keeps create available for explicit agent saves", () => {
    expect(
      shouldDisableSystemCreateForSavedAgentContact(
        "Add docs.rizom.ai to my agent directory",
      ),
    ).toBe(false);
  });
});

describe("buildBrainCallOptions", () => {
  const base = {
    userPermissionLevel: "trusted" as const,
    conversationId: "conv-1",
    channelId: "chan-1",
    channelName: "general",
    interfaceType: "cli",
  };

  test("includes only base options for a plain message", () => {
    const options = buildBrainCallOptions({
      ...base,
      message: "hello there",
      hasAccessibleUploads: false,
    });

    expect(options).toEqual({
      userPermissionLevel: "trusted",
      conversationId: "conv-1",
      channelId: "chan-1",
      channelName: "general",
      interfaceType: "cli",
    });
  });

  test("enables upload flows when uploads are accessible", () => {
    const options = buildBrainCallOptions({
      ...base,
      message: "hello there",
      hasAccessibleUploads: true,
    });

    expect(options.enableCreateUpload).toBe(true);
    expect(options.enableCreateTransform).toBe(true);
    expect(options.enableCreateSourceAttachment).toBeUndefined();
  });

  test("disables create for read-only upload summaries", () => {
    const options = buildBrainCallOptions({
      ...base,
      message: "Summarize the uploaded PDF.",
      hasAccessibleUploads: true,
    });

    expect(options.enableCreateUpload).toBe(true);
    expect(options.enableCreateTransform).toBe(true);
    expect(options.disableSystemCreate).toBe(true);
  });

  test("disables create for exact saved-agent contact requests", () => {
    const options = buildBrainCallOptions({
      ...base,
      message:
        "Can you ask docs.rizom.ai for help? I want to know how to set up a new rover",
      hasAccessibleUploads: false,
    });

    expect(options.disableSystemCreate).toBe(true);
  });

  test("enables source attachments and disables document generation for durable artifact requests", () => {
    const options = buildBrainCallOptions({
      ...base,
      message: "save a pdf of my deck",
      hasAccessibleUploads: false,
    });

    expect(options.enableCreateSourceAttachment).toBe(true);
    expect(options.disableDocumentGenerate).toBe(true);
  });

  test("passes agent context instructions through when present", () => {
    const options = buildBrainCallOptions({
      ...base,
      message: "hello there",
      hasAccessibleUploads: false,
      agentContextInstructions: "context notes",
    });

    expect(options.agentContextInstructions).toBe("context notes");
  });
});
