import { describe, it, expect, beforeEach, mock } from "bun:test";
import { materializePrompts, resetPromptCache } from "@brains/plugins";
import type { IEntityService } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";

describe("materializePrompts", () => {
  let mockEntityService: {
    getEntity: ReturnType<typeof mock>;
    createEntity: ReturnType<typeof mock>;
  };
  let mockTemplateRegistry: {
    list: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    resetPromptCache();

    mockEntityService = {
      getEntity: mock(() => Promise.resolve(null)),
      createEntity: mock(() =>
        Promise.resolve({ entityId: "test", jobId: "" }),
      ),
    };
  });

  it("should resolve a prompt for each template with basePrompt", async () => {
    mockTemplateRegistry = {
      list: mock(() => [
        { name: "blog:generation", basePrompt: "Write blog posts." },
        { name: "blog:excerpt", basePrompt: "Generate excerpts." },
        { name: "blog:post-list", basePrompt: undefined },
      ]),
    };

    const count = await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
    );

    expect(count).toBe(2);
    expect(mockEntityService.getEntity).toHaveBeenCalledTimes(2);
    expect(mockEntityService.createEntity).toHaveBeenCalledTimes(2);
  });

  it("should pass target as the entity id (colons replaced with dashes)", async () => {
    mockTemplateRegistry = {
      list: mock(() => [
        {
          name: "blog:generation",
          basePrompt: "Write blog posts in a distinctive voice.",
        },
      ]),
    };

    await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
    );

    expect(mockEntityService.getEntity).toHaveBeenCalledWith(
      "prompt",
      "blog-generation",
    );
  });

  it("should skip templates without basePrompt", async () => {
    mockTemplateRegistry = {
      list: mock(() => [
        { name: "nav:footer", basePrompt: undefined },
        { name: "homepage", basePrompt: undefined },
      ]),
    };

    const count = await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
    );

    expect(count).toBe(0);
    expect(mockEntityService.getEntity).not.toHaveBeenCalled();
  });

  it("should handle empty template registry", async () => {
    mockTemplateRegistry = {
      list: mock(() => []),
    };

    const count = await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
    );

    expect(count).toBe(0);
  });
});
