import { describe, expect, it } from "bun:test";
import { derivePreviewDomain } from "./domain";

describe("derivePreviewDomain", () => {
  it("uses preview subdomain for apex domains", () => {
    expect(derivePreviewDomain("yeehaa.io")).toBe("preview.yeehaa.io");
    expect(derivePreviewDomain("mylittlephoney.com")).toBe(
      "preview.mylittlephoney.com",
    );
  });

  it("uses preview subdomain under nested deployment domains", () => {
    expect(derivePreviewDomain("recall.rizom.ai")).toBe(
      "preview.recall.rizom.ai",
    );
    expect(derivePreviewDomain("max.rizom.ai")).toBe("preview.max.rizom.ai");
  });
});
