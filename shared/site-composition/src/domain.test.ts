import { describe, expect, it } from "bun:test";
import { derivePreviewDomain } from "./domain";

describe("derivePreviewDomain", () => {
  it("uses a preview child for dedicated and shared apex domains", () => {
    expect(derivePreviewDomain("yeehaa.io")).toBe("preview.yeehaa.io");
    expect(derivePreviewDomain("mylittlephoney.com")).toBe(
      "preview.mylittlephoney.com",
    );
    expect(derivePreviewDomain("rizom.ai")).toBe("preview.rizom.ai");
  });

  it("uses a preview sibling for direct rizom.ai tenants", () => {
    expect(derivePreviewDomain("recall.rizom.ai")).toBe(
      "recall-preview.rizom.ai",
    );
    expect(derivePreviewDomain("max.rizom.ai")).toBe("max-preview.rizom.ai");
  });

  it("supports a different shared parent explicitly", () => {
    expect(
      derivePreviewDomain("alice.brains.example", {
        sharedDomain: ".brains.example",
      }),
    ).toBe("alice-preview.brains.example");
    expect(
      derivePreviewDomain("brains.example", {
        sharedDomain: "brains.example",
      }),
    ).toBe("preview.brains.example");
  });

  it("normalizes URLs without treating deeper hosts as direct tenants", () => {
    expect(derivePreviewDomain("HTTPS://Recall.Rizom.AI/")).toBe(
      "recall-preview.rizom.ai",
    );
    expect(derivePreviewDomain("staging.recall.rizom.ai")).toBe(
      "preview.staging.recall.rizom.ai",
    );
  });
});
