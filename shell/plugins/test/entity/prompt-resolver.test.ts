import { describe, it, expect, beforeEach, mock } from "bun:test";
import { resolvePrompt } from "../../src/entity/prompt-resolver";
import type { IEntityService } from "@brains/entity-service";

describe("resolvePrompt", () => {
  let mockGetEntity: ReturnType<typeof mock>;
  let mockEntityService: Pick<IEntityService, "getEntity">;

  beforeEach(() => {
    mockGetEntity = mock();
    mockEntityService = {
      getEntity: mockGetEntity,
    };
  });

  it("should return entity body when prompt entity exists", async () => {
    mockGetEntity.mockResolvedValue({
      id: "blog-generation",
      entityType: "prompt",
      content:
        "---\ntitle: Blog Generation\ntarget: blog:generation\n---\nCustom prompt text.",
      metadata: { title: "Blog Generation", target: "blog:generation" },
    });

    const result = await resolvePrompt(
      mockEntityService as IEntityService,
      "blog:generation",
      "Default fallback prompt",
    );

    expect(result).toBe("Custom prompt text.");
    expect(mockGetEntity).toHaveBeenCalledWith("prompt", "blog-generation");
  });

  it("should return fallback when no prompt entity exists", async () => {
    mockGetEntity.mockResolvedValue(null);

    const result = await resolvePrompt(
      mockEntityService as IEntityService,
      "blog:generation",
      "Default fallback prompt",
    );

    expect(result).toBe("Default fallback prompt");
  });

  it("should return fallback when entity lookup throws", async () => {
    mockGetEntity.mockRejectedValue(new Error("DB error"));

    const result = await resolvePrompt(
      mockEntityService as IEntityService,
      "blog:generation",
      "Default fallback prompt",
    );

    expect(result).toBe("Default fallback prompt");
  });

  it("should extract body from markdown (strip frontmatter)", async () => {
    mockGetEntity.mockResolvedValue({
      id: "blog-generation",
      entityType: "prompt",
      content:
        "---\ntitle: Blog\ntarget: blog:generation\n---\n\nThe actual prompt body.",
      metadata: {},
    });

    const result = await resolvePrompt(
      mockEntityService as IEntityService,
      "blog:generation",
      "fallback",
    );

    expect(result).toBe("The actual prompt body.");
    expect(result).not.toContain("---");
    expect(result).not.toContain("title:");
  });

  it("should convert target to entity ID (colon to dash)", async () => {
    mockGetEntity.mockResolvedValue(null);

    await resolvePrompt(
      mockEntityService as IEntityService,
      "social-media:linkedin",
      "fallback",
    );

    expect(mockGetEntity).toHaveBeenCalledWith(
      "prompt",
      "social-media-linkedin",
    );
  });
});
