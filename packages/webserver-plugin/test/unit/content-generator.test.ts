import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerator } from "../../src/content-generator";
import type {
  Registry,
  EntityService,
  BaseEntity,
  ListOptions,
  PluginContext,
} from "@brains/types";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import * as yaml from "js-yaml";
import { z } from "zod";

describe("ContentGenerator", () => {
  let contentGenerator: ContentGenerator;
  let mockRegistry: Registry;
  let mockEntityService: EntityService;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(import.meta.dir, "test-output");
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Mock EntityService with proper typing
    const mockListEntities = async <T extends BaseEntity>(
      _entityType: string,
      _options?: Omit<ListOptions, "entityType">,
    ): Promise<T[]> => {
      return [
        {
          id: "note1",
          entityType: "note",
          title: "Test Note 1",
          content: "Content 1",
          tags: ["tag1", "tag2"],
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        {
          id: "note2",
          entityType: "note",
          title: "Test Note 2",
          content: "Content 2",
          tags: ["tag2", "tag3"],
          created: "2024-01-03T00:00:00Z",
          updated: "2024-01-04T00:00:00Z",
        },
      ] as unknown as T[];
    };

    mockEntityService = {
      listEntities: mock(mockListEntities) as EntityService["listEntities"],
      getEntityTypes: mock(() => ["note", "site-content"]),
    } as unknown as EntityService;

    // Mock Registry
    mockRegistry = {
      resolve: mock((serviceName: string) => {
        if (serviceName === "entityService") {
          return mockEntityService;
        }
        throw new Error(`Unknown service: ${serviceName}`);
      }),
    } as unknown as Registry;

    // Mock Plugin Context
    const mockContext = {
      registry: mockRegistry,
      logger: createSilentLogger("test"),
      query: mock(
        async <T>(_query: string, _schema: z.ZodType<T>): Promise<T> => {
          // Return landing page data matching the schema
          return {
            title: "Test Brain",
            tagline: "Test Description",
            hero: {
              headline: "Your Personal Knowledge Hub",
              subheadline:
                "Organize, connect, and discover your digital thoughts",
              ctaText: "View Dashboard",
              ctaLink: "/dashboard",
            },
          } as T;
        },
      ),
      // Other context properties we don't use in this test
      getPlugin: () => undefined,
      events: {} as unknown as PluginContext["events"],
      messageBus: {} as unknown as PluginContext["messageBus"],
      formatters: {} as unknown as PluginContext["formatters"],
    } as unknown as PluginContext;

    // Create ContentGenerator instance
    contentGenerator = new ContentGenerator({
      logger: createSilentLogger("test"),
      registry: mockRegistry,
      context: mockContext as PluginContext,
      astroSiteDir: testDir,
      siteTitle: "Test Brain",
      siteDescription: "Test Description",
      siteUrl: "https://test.com",
    });
  });

  describe("initialize", () => {
    it("should create content directories", async () => {
      await contentGenerator.initialize();

      expect(existsSync(join(testDir, "src/content"))).toBe(true);
      expect(existsSync(join(testDir, "src/content/landing"))).toBe(true);
      expect(existsSync(join(testDir, "src/content/dashboard"))).toBe(true);
    });

    it("should not fail if directories already exist", async () => {
      // Create directories first
      mkdirSync(join(testDir, "src/content/landing"), { recursive: true });

      // Should not throw
      await contentGenerator.initialize();

      expect(existsSync(join(testDir, "src/content/landing"))).toBe(true);
    });
  });

  describe("generateLandingPage", () => {
    it("should generate landing page YAML with correct data", async () => {
      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/landing/index.yaml");
      expect(existsSync(yamlPath)).toBe(true);

      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect(data["title"]).toBe("Test Brain");
      expect(data["tagline"]).toBe("Test Description");
      expect(data["hero"]).toBeDefined();
      const hero = data["hero"] as Record<string, unknown>;
      expect(hero["headline"]).toBe("Your Personal Knowledge Hub");
      expect(hero["subheadline"]).toBe(
        "Organize, connect, and discover your digital thoughts",
      );
      expect(hero["ctaText"]).toBe("View Dashboard");
      expect(hero["ctaLink"]).toBe("/dashboard");
    });

    it("should use existing site-content for landing page when available", async () => {
      // Mock existing site-content
      const mockSiteContent = {
        id: "test-site-content",
        entityType: "site-content",
        title: "landing:hero",
        content: "Existing hero content",
        page: "landing",
        section: "hero",
        data: {
          headline: "Existing Headline",
          subheadline: "Existing Subheadline",
          ctaText: "Existing CTA",
          ctaLink: "/existing",
        },
        tags: ["site-content", "landing", "hero"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Mock EntityService to return our site-content
      const mockListEntities = mock(
        async (entityType: string, options?: any) => {
          if (
            entityType === "site-content" &&
            options?.filter?.metadata?.title === "landing:hero"
          ) {
            return [mockSiteContent];
          }
          return [];
        },
      );

      // Replace the mock EntityService's listEntities method
      mockEntityService.listEntities =
        mockListEntities as EntityService["listEntities"];

      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/landing/index.yaml");
      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      // Should have hero section (either from existing content or query)
      const hero = data["hero"] as Record<string, unknown>;
      expect(hero).toBeDefined();
      expect(hero["headline"]).toBe("Existing Headline");
      expect(hero["subheadline"]).toBe("Existing Subheadline");
      expect(hero["ctaText"]).toBe("Existing CTA");
      expect(hero["ctaLink"]).toBe("/existing");
    });

    it("should generate dashboard YAML with correct data", async () => {
      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      expect(existsSync(yamlPath)).toBe(true);

      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect(data["title"]).toBe("Test Brain");
      expect(data["description"]).toBe("Test Description");
      // Should have at least 2 entities (the mock notes)
      expect((data["stats"] as Record<string, unknown>)["entityCount"]).toBeGreaterThanOrEqual(2);
      // Dashboard shows up to 5 recent entities from all entity types
      expect((data["recentEntities"] as unknown[]).length).toBeGreaterThan(0);
      expect(
        ((data["recentEntities"] as unknown[])[0] as Record<string, unknown>)[
          "title"
        ],
      ).toBe("Test Note 2"); // Most recent first
    });

    it("should handle empty notes list", async () => {
      const emptyListEntities = async <T extends BaseEntity>(
        _entityType: string,
        _options?: Omit<ListOptions, "entityType">,
      ): Promise<T[]> => [] as unknown as T[];

      mockEntityService.listEntities = mock(
        emptyListEntities,
      ) as EntityService["listEntities"];

      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect((data["stats"] as Record<string, unknown>)["entityCount"]).toBe(0);
      // No tagCount in new schema
      expect(data["recentEntities"] as unknown[]).toHaveLength(0);
    });

    it("should limit recent notes to 5", async () => {
      // Mock more than 5 notes
      const manyNotes = Array.from({ length: 10 }, (_, i) => ({
        id: `note${i}`,
        entityType: "note",
        title: `Test Note ${i}`,
        content: `Content ${i}`,
        tags: [`tag${i}`],
        created: `2024-01-0${i}T00:00:00Z`,
        updated: `2024-01-0${i}T00:00:00Z`,
      }));

      const manyNotesListEntities = async <T extends BaseEntity>(
        _entityType: string,
        _options?: Omit<ListOptions, "entityType">,
      ): Promise<T[]> => manyNotes as unknown as T[];

      mockEntityService.listEntities = mock(
        manyNotesListEntities,
      ) as EntityService["listEntities"];

      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect(data["recentEntities"] as unknown[]).toHaveLength(5);
    });
  });

  describe("checkForSiteContent", () => {
    it("should return true if site-content entities exist", async () => {
      const siteContentListEntities = async <T extends BaseEntity>(
        type: string,
        _options?: Omit<ListOptions, "entityType">,
      ): Promise<T[]> => {
        if (type === "site-content") {
          return [{ id: "sc1", entityType: "site-content" }] as unknown as T[];
        }
        return [] as unknown as T[];
      };

      mockEntityService.listEntities = mock(
        siteContentListEntities,
      ) as EntityService["listEntities"];

      const hasSiteContent = await contentGenerator.checkForSiteContent();
      expect(hasSiteContent).toBe(true);
    });

    it("should return false if no site-content entities exist", async () => {
      const noSiteContentListEntities = async <T extends BaseEntity>(
        type: string,
        _options?: Omit<ListOptions, "entityType">,
      ): Promise<T[]> => {
        if (type === "site-content") {
          return [] as unknown as T[];
        }
        return [] as unknown as T[];
      };

      mockEntityService.listEntities = mock(
        noSiteContentListEntities,
      ) as EntityService["listEntities"];

      const hasSiteContent = await contentGenerator.checkForSiteContent();
      expect(hasSiteContent).toBe(false);
    });

    it("should return false if entity type throws error", async () => {
      const errorListEntities = async <T extends BaseEntity>(
        type: string,
        _options?: Omit<ListOptions, "entityType">,
      ): Promise<T[]> => {
        if (type === "site-content") {
          throw new Error("Entity type not registered");
        }
        return [] as unknown as T[];
      };

      mockEntityService.listEntities = mock(
        errorListEntities,
      ) as EntityService["listEntities"];

      const hasSiteContent = await contentGenerator.checkForSiteContent();
      expect(hasSiteContent).toBe(false);
    });
  });

  // Cleanup
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });
});
