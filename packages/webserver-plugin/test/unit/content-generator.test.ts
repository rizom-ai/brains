import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerator } from "../../src/content-generator";
import type {
  EntityService,
  BaseEntity,
  ListOptions,
  PluginContext,
  ContentGenerateOptions,
} from "@brains/types";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import * as yaml from "js-yaml";
import type { z } from "zod";
import {
  type LandingHeroData,
  type FeaturesSection,
  type CTASection,
  type LandingPageReferenceData,
  type DashboardData,
} from "../../src/content-schemas";

describe("ContentGenerator", () => {
  let contentGenerator: ContentGenerator;
  let mockEntityService: EntityService;
  const testDir = join(__dirname, "test-content");

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Mock EntityService with minimum needed methods
    mockEntityService = {
      createEntity: mock(async () => ({
        id: "test-id",
        entityType: "test",
        content: "test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      })),
      listEntities: mock(
        async <T extends BaseEntity>(
          _entityType: string,
          _options?: ListOptions,
        ): Promise<T[]> => {
          // Return empty array by default - tests will override as needed
          return [];
        },
      ),
      searchEntities: mock(async () => ({ results: [], total: 0 })),
      getEntity: mock(async () => null),
      updateEntity: mock(async () => ({
        id: "test-id",
        entityType: "test",
        content: "test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      })),
      deleteEntity: mock(async () => ({ success: true })),
      getEntityTypes: mock(() => ["note", "site-content"]),
    } as unknown as EntityService;


    // Mock Plugin Context
    const mockContext = {
      pluginId: "webserver",
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
      generateContent: mock(
        async <T>(options: ContentGenerateOptions<T>): Promise<T> => {
          // Return appropriate data based on content type
          if (options.contentType === "section:hero") {
            const heroData: LandingHeroData = {
              headline: "Your Personal Knowledge Hub",
              subheadline:
                "Organize, connect, and discover your digital thoughts",
              ctaText: "View Dashboard",
              ctaLink: "/dashboard",
            };
            return options.schema.parse(heroData);
          } else if (options.contentType === "section:features") {
            const featuresData: FeaturesSection = {
              label: "Features",
              headline: "Powerful Features",
              description: "Everything you need",
              features: [
                {
                  icon: "check",
                  title: "Feature 1",
                  description: "Description 1",
                },
              ],
            };
            return options.schema.parse(featuresData);
          } else if (options.contentType === "section:cta") {
            const ctaData: CTASection = {
              headline: "Get Started Today",
              description: "Join now",
              primaryButton: {
                text: "Start Free",
                link: "/signup",
              },
            };
            return options.schema.parse(ctaData);
          } else if (options.contentType === "page:landing") {
            const referenceData: LandingPageReferenceData = {
              title: "Test Brain",
              tagline: "Test Description",
              heroId: "hero-section-test",
              featuresId: "features-section-test",
              ctaId: "cta-section-test",
            };
            return options.schema.parse(referenceData);
          } else if (options.contentType === "page:dashboard") {
            const dashboardData: DashboardData = {
              title: "Dashboard",
              description: "Your knowledge overview",
              stats: {
                entityCount: 10,
                entityTypeCount: 3,
                lastUpdated: new Date().toISOString(),
              },
              recentEntities: [],
            };
            return options.schema.parse(dashboardData);
          }
          // Default return for unknown content types
          throw new Error(`Unknown content type: ${options.contentType}`);
        },
      ),
      // Other context properties we don't use in this test
      getPlugin: () => undefined,
      events: {} as unknown as PluginContext["events"],
      messageBus: {} as unknown as PluginContext["messageBus"],
      formatters: {} as unknown as PluginContext["formatters"],
      contentTypes: {
        register: mock(() => {}),
        list: mock(() => []),
      },
      registerEntityType: mock(() => {}),
      // Direct service access (added to PluginContext)
      entityService: mockEntityService,
      contentTypeRegistry: {
        register: mock(() => {}),
        get: mock(() => null),
        list: mock(() => []),
        has: mock(() => false),
        getFormatter: mock(() => null),
        clear: mock(() => {}),
      },
    } as unknown as PluginContext;

    // Create ContentGenerator instance
    contentGenerator = new ContentGenerator({
      logger: createSilentLogger("test"),
      context: mockContext,
      astroSiteDir: testDir,
      siteTitle: "Test Brain",
      siteDescription: "Test Description",
      siteUrl: "https://test.com",
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
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

      // Check features section
      expect(data["features"]).toBeDefined();
      const features = data["features"] as Record<string, unknown>;
      expect(features["label"]).toBe("Features");
      expect(features["headline"]).toBe("Powerful Features");
      expect(features["description"]).toBe("Everything you need");
      expect(features["features"]).toBeInstanceOf(Array);
      const featuresList = features["features"] as Array<
        Record<string, unknown>
      >;
      expect(featuresList).toHaveLength(1);
      expect(featuresList[0]?.["title"]).toBe("Feature 1");

      // Check CTA section
      expect(data["cta"]).toBeDefined();
      const cta = data["cta"] as Record<string, unknown>;
      expect(cta["headline"]).toBe("Get Started Today");
    });

    it("should generate dashboard YAML with correct data", async () => {
      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      expect(existsSync(yamlPath)).toBe(true);

      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      expect(data["title"]).toBe("Test Brain");
      expect(data["description"]).toBe("Test Description");
      expect(data["stats"]).toBeDefined();
      expect(data["recentEntities"]).toBeInstanceOf(Array);
    });

    it("should handle empty notes list", async () => {
      // Mock empty entity list
      const mockListEntities = mock(async (): Promise<BaseEntity[]> => []);
      mockEntityService.listEntities =
        mockListEntities as EntityService["listEntities"];

      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      const stats = data["stats"] as Record<string, unknown>;
      expect(stats["entityCount"]).toBe(0);
      expect(stats["entityTypeCount"]).toBe(2); // From getEntityTypes mock
      expect(data["recentEntities"]).toEqual([]);
    });

    it("should reject invalid existing content and generate new", async () => {
      // Mock invalid existing content
      const mockGeneratedContent = {
        id: "test-generated-content",
        entityType: "generated-content",
        contentType: "webserver:landing:page",
        data: {
          // Missing required fields
          title: "Test",
        },
        content: "Invalid content",
        metadata: {
          prompt: "Generate landing page",
          generatedAt: new Date().toISOString(),
          generatedBy: "test",
          regenerated: false,
          validationStatus: "invalid" as const,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockListEntities = mock(
        async (
          entityType: string,
          options?: { filter?: { metadata?: { contentType?: string } } },
        ) => {
          if (
            entityType === "generated-content" &&
            options?.filter?.metadata?.contentType === "webserver:landing:page"
          ) {
            return [mockGeneratedContent];
          }
          return [];
        },
      );
      mockEntityService.listEntities =
        mockListEntities as EntityService["listEntities"];

      // Should not throw, should generate new content
      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/landing/index.yaml");
      expect(existsSync(yamlPath)).toBe(true);

      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      // Should have new generated content
      expect(data["title"]).toBe("Test Brain");
      expect(data["hero"]).toBeDefined();
    });

    it("should limit recent notes to 5", async () => {
      // Mock many entities
      const mockEntities = Array.from({ length: 10 }, (_, i) => ({
        id: `note-${i}`,
        entityType: "note",
        content: `Note ${i} content`,
        created: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
        updated: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      const mockListEntities = mock(async (): Promise<BaseEntity[]> => {
        return mockEntities;
      });
      mockEntityService.listEntities =
        mockListEntities as EntityService["listEntities"];

      await contentGenerator.generateAll();

      const yamlPath = join(testDir, "src/content/dashboard/index.yaml");
      const content = await readFile(yamlPath, "utf-8");
      const data = yaml.load(content) as Record<string, unknown>;

      const recentEntities = data["recentEntities"] as Array<unknown>;
      expect(recentEntities.length).toBe(5);

      // Should be sorted by most recent first
      const firstEntity = recentEntities[0] as Record<string, unknown>;
      expect(firstEntity["id"]).toBe("note-0");
    });
  });
});
