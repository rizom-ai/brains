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
      query: mock(async <T>(_query: string, _schema: unknown): Promise<T> => {
        // Return landing page data matching the schema
        return {
          title: "Test Brain",
          tagline: "Test Description",
          hero: {
            headline: "Your Personal Knowledge Hub",
            subheadline: "Organize, connect, and discover your digital thoughts",
            ctaText: "View Dashboard",
            ctaLink: "/dashboard",
          },
        } as T;
      }),
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
      context: mockContext,
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
      expect(hero["subheadline"]).toBe("Organize, connect, and discover your digital thoughts");
      expect(hero["ctaText"]).toBe("View Dashboard");
      expect(hero["ctaLink"]).toBe("/dashboard");
    });

    it("should generate dashboard YAML with correct data", async () => {
      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      expect(existsSync(yamlPath)).toBe(true);

      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect(data["title"]).toBe("Test Brain");
      expect(data["description"]).toBe("Test Description");
      expect((data["stats"] as Record<string, unknown>)["noteCount"]).toBe(2);
      expect((data["stats"] as Record<string, unknown>)["tagCount"]).toBe(3); // tag1, tag2, tag3
      expect(data["recentNotes"] as unknown[]).toHaveLength(2);
      expect(
        ((data["recentNotes"] as unknown[])[0] as Record<string, unknown>)[
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

      expect((data["stats"] as Record<string, unknown>)["noteCount"]).toBe(0);
      expect((data["stats"] as Record<string, unknown>)["tagCount"]).toBe(0);
      expect(data["recentNotes"] as unknown[]).toHaveLength(0);
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

      expect(data["recentNotes"] as unknown[]).toHaveLength(5);
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
