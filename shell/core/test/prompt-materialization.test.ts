import { describe, it, expect, beforeEach, mock } from "bun:test";
import { resetPromptCache } from "@brains/plugins";
import type { IEntityService } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";

/**
 * Tests for prompt materialization at startup.
 *
 * On sync:initial:completed, the shell should iterate all registered
 * templates and create prompt entities for those with basePrompt.
 */

// Inline the materialization logic we'll add to the shell
async function materializePrompts(
  templateRegistry: TemplateRegistry,
  entityService: IEntityService,
  resolvePromptFn: (
    entityService: IEntityService,
    target: string,
    fallback: string,
  ) => Promise<string>,
): Promise<number> {
  const templates = templateRegistry.list();
  let count = 0;
  for (const template of templates) {
    if (template.basePrompt) {
      await resolvePromptFn(entityService, template.name, template.basePrompt);
      count++;
    }
  }
  return count;
}

describe("prompt materialization at startup", () => {
  let mockEntityService: {
    getEntity: ReturnType<typeof mock>;
    createEntity: ReturnType<typeof mock>;
  };
  let mockTemplateRegistry: {
    list: ReturnType<typeof mock>;
  };
  let resolvePromptFn: ReturnType<typeof mock>;

  beforeEach(() => {
    resetPromptCache();

    mockEntityService = {
      getEntity: mock(() => Promise.resolve(null)),
      createEntity: mock(() =>
        Promise.resolve({ entityId: "test", jobId: "" }),
      ),
    };

    resolvePromptFn = mock(
      async (
        _es: IEntityService,
        _target: string,
        fallback: string,
      ): Promise<string> => fallback,
    );
  });

  it("should call resolvePrompt for each template with basePrompt", async () => {
    mockTemplateRegistry = {
      list: mock(() => [
        { name: "blog:generation", basePrompt: "Write blog posts." },
        { name: "blog:excerpt", basePrompt: "Generate excerpts." },
        { name: "blog:post-list", basePrompt: undefined }, // no basePrompt
      ]),
    };

    const count = await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
      resolvePromptFn,
    );

    expect(resolvePromptFn).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it("should pass correct target and fallback to resolvePrompt", async () => {
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
      resolvePromptFn,
    );

    expect(resolvePromptFn).toHaveBeenCalledWith(
      mockEntityService,
      "blog:generation",
      "Write blog posts in a distinctive voice.",
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
      resolvePromptFn,
    );

    expect(resolvePromptFn).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it("should handle empty template registry", async () => {
    mockTemplateRegistry = {
      list: mock(() => []),
    };

    const count = await materializePrompts(
      mockTemplateRegistry as unknown as TemplateRegistry,
      mockEntityService as unknown as IEntityService,
      resolvePromptFn,
    );

    expect(count).toBe(0);
  });
});
