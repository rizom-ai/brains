import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  materializePrompts,
  resetPromptMaterialization,
} from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import type { BaseEntity, IEntityService } from "@brains/entity-service";
import {
  createMockEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { InMemoryTemplateRegistry } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";

function template(name: string, basePrompt?: string): Template {
  return {
    name,
    description: name,
    schema: z.object({}),
    requiredPermission: "public",
    ...(basePrompt !== undefined && { basePrompt }),
  };
}

function registry(
  entries: Array<[key: string, template: Template]>,
): InMemoryTemplateRegistry {
  const templates = InMemoryTemplateRegistry.createFresh();
  for (const [key, t] of entries) templates.register(key, t);
  return templates;
}

/** An entity service holding prompt entities in memory, so writes are read back. */
function createPromptStore(
  options: { entityTypes?: string[]; unreadable?: string } = {},
): {
  service: IEntityService;
  prompts: Map<string, BaseEntity>;
} {
  const { entityTypes = ["prompt"], unreadable } = options;
  const prompts = new Map<string, BaseEntity>();
  const service = createMockEntityService({
    entityTypes,
    getEntityImpl: async ({ id }) => {
      if (id === unreadable) throw new Error("disk unreadable");
      return prompts.get(id) ?? null;
    },
  });
  spyOn(service, "createEntity").mockImplementation(async ({ entity }) => {
    const id = entity.id ?? "";
    prompts.set(
      id,
      createTestEntity<BaseEntity>("prompt", {
        id,
        content: entity.content,
        metadata: entity.metadata,
      }),
    );
    return { entityId: id, jobId: "", skipped: false };
  });
  spyOn(service, "updateEntity").mockImplementation(async ({ entity }) => {
    prompts.set(entity.id, entity);
    return { entityId: entity.id, jobId: "", skipped: false };
  });
  spyOn(service, "deleteEntity").mockImplementation(async ({ id }) =>
    prompts.delete(id),
  );
  return { service, prompts };
}

const frontmatterSchema = z.record(z.string(), z.unknown());

function stored(
  prompts: Map<string, BaseEntity>,
  id: string,
): { body: string; frontmatter: Record<string, unknown>; entity: BaseEntity } {
  const entity = prompts.get(id);
  if (!entity) throw new Error(`Missing prompt ${id}`);
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    frontmatterSchema,
  );
  return {
    body: parsed.content.trim(),
    frontmatter: parsed.metadata,
    entity,
  };
}

function seed(
  prompts: Map<string, BaseEntity>,
  id: string,
  frontmatter: Record<string, unknown>,
  body: string,
): BaseEntity {
  const entity = createTestEntity("prompt", {
    id,
    content: generateMarkdownWithFrontmatter(body, frontmatter),
    metadata: frontmatter,
  });
  prompts.set(id, entity);
  return entity;
}

function editBody(
  prompts: Map<string, BaseEntity>,
  id: string,
  body: string,
): void {
  const { frontmatter } = stored(prompts, id);
  seed(prompts, id, frontmatter, body);
}

describe("materializePrompts", () => {
  beforeEach(() => {
    resetPromptMaterialization();
  });

  it("creates a missing prompt with the hash of the default it was written from", async () => {
    const { service, prompts } = createPromptStore();

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Write.")]]),
      service,
    );

    expect(report.created).toEqual(["blog:generation"]);
    const { body, frontmatter, entity } = stored(prompts, "blog-generation");
    expect(body).toBe("Write.");
    expect(frontmatter["target"]).toBe("blog:generation");
    expect(frontmatter["defaultHash"]).toEqual(expect.any(String));
    expect(entity.metadata["defaultHash"]).toBe(frontmatter["defaultHash"]);
  });

  it("skips templates without basePrompt", async () => {
    const { service, prompts } = createPromptStore();

    const report = await materializePrompts(
      registry([
        ["blog:generation", template("blog:generation", "Write.")],
        ["blog:post-list", template("blog:post-list")],
      ]),
      service,
    );

    expect(report.created).toEqual(["blog:generation"]);
    expect([...prompts.keys()]).toEqual(["blog-generation"]);
  });

  it("writes nothing when the prompt entity type is not registered", async () => {
    const { service, prompts } = createPromptStore({ entityTypes: [] });

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Write.")]]),
      service,
    );

    expect(report.created).toEqual([]);
    expect(prompts.size).toBe(0);
    expect(service.getEntity).not.toHaveBeenCalled();
  });

  it("leaves an untouched copy alone while its default is unchanged", async () => {
    const { service } = createPromptStore();
    const templates = registry([
      ["blog:generation", template("blog:generation", "Write.")],
    ]);
    await materializePrompts(templates, service);

    const report = await materializePrompts(templates, service);

    expect(service.updateEntity).not.toHaveBeenCalled();
    expect(report).toEqual({
      created: [],
      refreshed: [],
      stamped: [],
      retitled: [],
      staleOverrides: [],
      unverifiedOverrides: [],
      removedLegacy: [],
      failed: [],
    });
  });

  it("reports a prompt it could not read and still syncs the rest", async () => {
    const { service, prompts } = createPromptStore({
      unreadable: "blog-excerpt",
    });

    const report = await materializePrompts(
      registry([
        ["blog:generation", template("blog:generation", "Write.")],
        ["blog:excerpt", template("blog:excerpt", "Excerpt.")],
      ]),
      service,
    );

    expect(report.failed).toEqual([
      { target: "blog:excerpt", error: "disk unreadable" },
    ]);
    expect(report.created).toEqual(["blog:generation"]);
    expect(prompts.has("blog-generation")).toBe(true);
  });

  it("refreshes an untouched copy when its default changes", async () => {
    const { service, prompts } = createPromptStore();
    await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Old.")]]),
      service,
    );
    const oldHash = stored(prompts, "blog-generation").frontmatter[
      "defaultHash"
    ];

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "New.")]]),
      service,
    );

    expect(report.refreshed).toEqual(["blog:generation"]);
    const { body, frontmatter, entity } = stored(prompts, "blog-generation");
    expect(body).toBe("New.");
    expect(frontmatter["defaultHash"]).not.toBe(oldHash);
    expect(entity.metadata["defaultHash"]).toBe(frontmatter["defaultHash"]);
  });

  it("keeps a customised title when refreshing", async () => {
    const { service, prompts } = createPromptStore();
    await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Old.")]]),
      service,
    );
    const { frontmatter } = stored(prompts, "blog-generation");
    seed(
      prompts,
      "blog-generation",
      { ...frontmatter, title: "My Blog Voice" },
      "Old.",
    );

    await materializePrompts(
      registry([["blog:generation", template("blog:generation", "New.")]]),
      service,
    );

    expect(stored(prompts, "blog-generation").frontmatter["title"]).toBe(
      "My Blog Voice",
    );
  });

  it("corrects a title still in its old generated form, keeping an edited body", async () => {
    const { service, prompts } = createPromptStore();
    const templates = registry([
      ["social-media:linkedin", template("social-media:linkedin", "Post.")],
    ]);
    await materializePrompts(templates, service);
    const { frontmatter } = stored(prompts, "social-media-linkedin");
    seed(
      prompts,
      "social-media-linkedin",
      { ...frontmatter, title: "Social Media Linkedin" },
      "My own post rules.",
    );

    const report = await materializePrompts(templates, service);

    expect(report.retitled).toEqual(["social-media:linkedin"]);
    const after = stored(prompts, "social-media-linkedin");
    expect(after.frontmatter["title"]).toBe("Social Media LinkedIn");
    expect(after.entity.metadata["title"]).toBe("Social Media LinkedIn");
    expect(after.body).toBe("My own post rules.");
  });

  it("leaves a title edited by hand alone", async () => {
    const { service, prompts } = createPromptStore();
    const templates = registry([
      ["social-media:linkedin", template("social-media:linkedin", "Post.")],
    ]);
    await materializePrompts(templates, service);
    const { frontmatter } = stored(prompts, "social-media-linkedin");
    seed(
      prompts,
      "social-media-linkedin",
      { ...frontmatter, title: "My Linkedin voice" },
      "Post.",
    );

    const report = await materializePrompts(templates, service);

    expect(report.retitled).toEqual([]);
    expect(stored(prompts, "social-media-linkedin").frontmatter["title"]).toBe(
      "My Linkedin voice",
    );
  });

  it("keeps an edited copy and reports it when its default changes", async () => {
    const { service, prompts } = createPromptStore();
    await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Old.")]]),
      service,
    );
    editBody(prompts, "blog-generation", "Mine.");

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "New.")]]),
      service,
    );

    expect(report.staleOverrides).toEqual(["blog:generation"]);
    expect(report.refreshed).toEqual([]);
    expect(stored(prompts, "blog-generation").body).toBe("Mine.");
  });

  it("keeps an edited copy silently while its default is unchanged", async () => {
    const { service, prompts } = createPromptStore();
    const templates = registry([
      ["blog:generation", template("blog:generation", "Write.")],
    ]);
    await materializePrompts(templates, service);
    editBody(prompts, "blog-generation", "Mine.");

    const report = await materializePrompts(templates, service);

    expect(report.staleOverrides).toEqual([]);
    expect(stored(prompts, "blog-generation").body).toBe("Mine.");
  });

  it("stamps a copy edited to match the new default", async () => {
    const { service, prompts } = createPromptStore();
    await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Old.")]]),
      service,
    );
    editBody(prompts, "blog-generation", "New.");

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "New.")]]),
      service,
    );

    expect(report.stamped).toEqual(["blog:generation"]);
    expect(report.staleOverrides).toEqual([]);
  });

  it("stamps a legacy copy that still equals the default", async () => {
    const fresh = createPromptStore();
    const templates = registry([
      ["blog:generation", template("blog:generation", "Write.")],
    ]);
    await materializePrompts(templates, fresh.service);
    const { service, prompts } = createPromptStore();
    seed(
      prompts,
      "blog-generation",
      { title: "Blog Generation", target: "blog:generation" },
      "Write.",
    );

    const report = await materializePrompts(templates, service);

    expect(report.stamped).toEqual(["blog:generation"]);
    const { body, frontmatter } = stored(prompts, "blog-generation");
    expect(body).toBe("Write.");
    expect(frontmatter["defaultHash"]).toBe(
      stored(fresh.prompts, "blog-generation").frontmatter["defaultHash"],
    );
  });

  it("keeps a legacy copy that differs from the default and reports it as unverified", async () => {
    const { service, prompts } = createPromptStore();
    const legacy = seed(
      prompts,
      "blog-generation",
      { title: "Blog Generation", target: "blog:generation" },
      "An older default.",
    );

    const report = await materializePrompts(
      registry([["blog:generation", template("blog:generation", "Write.")]]),
      service,
    );

    expect(report.unverifiedOverrides).toEqual(["blog:generation"]);
    expect(service.updateEntity).not.toHaveBeenCalled();
    expect(prompts.get("blog-generation")).toBe(legacy);
  });

  it("materializes under the registry key generation looks up", async () => {
    const { service, prompts } = createPromptStore();

    await materializePrompts(
      registry([
        [
          "professional-site:about-highlights",
          template("about-highlights", "Highlights."),
        ],
      ]),
      service,
    );

    expect([...prompts.keys()]).toEqual(["professional-site-about-highlights"]);
    expect(
      stored(prompts, "professional-site-about-highlights").frontmatter[
        "target"
      ],
    ).toBe("professional-site:about-highlights");
  });

  it("removes a copy materialized under the template's short name", async () => {
    const { service, prompts } = createPromptStore();
    const legacy = seed(
      prompts,
      "about-highlights",
      { title: "About Highlights", target: "about-highlights" },
      "Highlights.",
    );

    const report = await materializePrompts(
      registry([
        [
          "professional-site:about-highlights",
          template("about-highlights", "Highlights."),
        ],
      ]),
      service,
    );

    expect(report.removedLegacy).toEqual(["about-highlights"]);
    expect(prompts.has("about-highlights")).toBe(false);
    expect(service.deleteEntity).toHaveBeenCalledWith({
      entityType: "prompt",
      id: "about-highlights",
      options: { expectedContentHash: legacy.contentHash },
    });
  });

  it("keeps a short-name prompt that targets something else", async () => {
    const { service, prompts } = createPromptStore();
    seed(
      prompts,
      "about-highlights",
      { title: "Mine", target: "my-own:prompt" },
      "Mine.",
    );

    const report = await materializePrompts(
      registry([
        [
          "professional-site:about-highlights",
          template("about-highlights", "Highlights."),
        ],
      ]),
      service,
    );

    expect(report.removedLegacy).toEqual([]);
    expect(prompts.has("about-highlights")).toBe(true);
  });

  it("keeps a short-name prompt that another registry key reads", async () => {
    const { service, prompts } = createPromptStore();
    seed(
      prompts,
      "about-highlights",
      { title: "About Highlights", target: "about-highlights" },
      "Plain.",
    );

    const report = await materializePrompts(
      registry([
        ["about-highlights", template("about-highlights", "Plain.")],
        [
          "professional-site:about-highlights",
          template("about-highlights", "Highlights."),
        ],
      ]),
      service,
    );

    expect(report.removedLegacy).toEqual([]);
    expect(prompts.has("about-highlights")).toBe(true);
  });
});
