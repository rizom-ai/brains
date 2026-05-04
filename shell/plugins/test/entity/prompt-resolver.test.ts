import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  resolvePrompt,
  resetPromptCache,
} from "../../src/entity/prompt-resolver";
import type { IEntityService } from "@brains/entity-service";

describe("resolvePrompt", () => {
  let mockGetEntity: ReturnType<typeof mock>;
  let mockCreateEntity: ReturnType<typeof mock>;
  let mockEntityService: Pick<IEntityService, "getEntity" | "createEntity">;

  beforeEach(() => {
    resetPromptCache();
    mockGetEntity = mock();
    mockCreateEntity = mock(() =>
      Promise.resolve({ entityId: "test", jobId: "" }),
    );
    mockEntityService = {
      getEntity: mockGetEntity,
      createEntity: mockCreateEntity,
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
    expect(mockGetEntity).toHaveBeenCalledWith({
      entityType: "prompt",
      id: "blog-generation",
    });
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

    expect(mockGetEntity).toHaveBeenCalledWith({
      entityType: "prompt",
      id: "social-media-linkedin",
    });
  });

  describe("auto-materialization", () => {
    it("should create prompt entity from fallback when none exists", async () => {
      mockGetEntity.mockResolvedValue(null);

      await resolvePrompt(
        mockEntityService as IEntityService,
        "blog:generation",
        "You write blog posts in a distinctive voice.",
      );

      expect(mockCreateEntity).toHaveBeenCalledTimes(1);
      expect(mockCreateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "blog-generation",
          entityType: "prompt",
          metadata: expect.objectContaining({
            title: "Blog Generation",
            target: "blog:generation",
          }),
        }),
      });
    });

    it("should not create entity when one already exists", async () => {
      mockGetEntity.mockResolvedValue({
        id: "blog-generation",
        entityType: "prompt",
        content: "---\ntitle: Blog\ntarget: blog:generation\n---\nCustom.",
        metadata: {},
      });

      await resolvePrompt(
        mockEntityService as IEntityService,
        "blog:generation",
        "fallback",
      );

      expect(mockCreateEntity).not.toHaveBeenCalled();
    });

    it("should only attempt creation once per target", async () => {
      mockGetEntity.mockResolvedValue(null);

      await resolvePrompt(
        mockEntityService as IEntityService,
        "blog:generation",
        "fallback",
      );
      await resolvePrompt(
        mockEntityService as IEntityService,
        "blog:generation",
        "fallback",
      );

      expect(mockCreateEntity).toHaveBeenCalledTimes(1);
    });

    it("should handle creation failure silently", async () => {
      mockGetEntity.mockResolvedValue(null);
      mockCreateEntity.mockRejectedValue(
        new Error("entity type not registered"),
      );

      const result = await resolvePrompt(
        mockEntityService as IEntityService,
        "blog:generation",
        "fallback prompt",
      );

      expect(result).toBe("fallback prompt");
    });

    it("should generate correct title from target", async () => {
      mockGetEntity.mockResolvedValue(null);

      await resolvePrompt(
        mockEntityService as IEntityService,
        "social-media:linkedin",
        "fallback",
      );

      expect(mockCreateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          metadata: expect.objectContaining({
            title: "Social Media Linkedin",
          }),
        }),
      });
    });
  });
});
