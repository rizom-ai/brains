import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentGenerator } from "../../src/content-generator";
import type {
  PluginContext,
  BaseEntity,
  ListOptions,
  ProgressNotification,
} from "@brains/types";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import * as yaml from "js-yaml";
import { GeneralContextFormatter } from "../../src/content/general";
import type { DashboardData } from "../../src/content/dashboard/index/schema";

describe("ContentGenerator", () => {
  let contentGenerator: ContentGenerator;
  const testDir = join(__dirname, "test-content");

  // Create a minimal mock context that behaves like the real system
  function createMockContext(): PluginContext {
    const storedEntities = new Map<string, BaseEntity>();

    const mockListEntities = <T extends BaseEntity>(
      entityType: string,
      options?: Omit<ListOptions, "entityType">,
    ): Promise<T[]> => {
      const entities = Array.from(storedEntities.values()).filter(
        (e) => e.entityType === entityType,
      );
      if (options?.filter?.metadata) {
        return Promise.resolve(
          entities.filter((e) => {
            const metadata = options.filter?.metadata;
            if (!metadata) return true;
            return Object.entries(metadata).every(
              ([key, value]) => (e as Record<string, unknown>)[key] === value,
            );
          }) as T[],
        );
      }
      return Promise.resolve(entities as T[]);
    };

    return {
      pluginId: "webserver",
      logger: createSilentLogger("test"),
      entityService: {
        createEntity: mock(async (entity) => {
          const id = `${entity.entityType}-${Date.now()}-${Math.random()}`;
          const fullEntity = {
            ...entity,
            id,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };
          storedEntities.set(id, fullEntity);
          return fullEntity;
        }),
        updateEntity: mock(async (entity) => {
          storedEntities.set(entity.id, entity);
          return entity;
        }),
        listEntities: mock(mockListEntities),
        getEntityTypes: mock(() => ["note", "site-content"]),
      },
      contentGenerationService: {
        generateContent: mock(async (contentType) => {
          // Return valid content for each supported type
          const contents: Record<string, unknown> = {
            "webserver:general": {
              organizationName: "Test Organization",
              tagline: "Making things better",
              mission: "To create amazing software",
              vision: "A world of better tools",
              values: [
                { name: "Quality", description: "We care about quality" },
                { name: "Innovation", description: "We innovate constantly" },
                { name: "Community", description: "We build together" },
              ],
              tone: "professional",
              themes: ["software", "innovation", "community"],
              audience: {
                primary: "Developers and creators",
                secondary: "Tech enthusiasts",
              },
              focusAreas: ["Tools", "Education", "Open Source"],
            },
            "webserver:landing": {
              title: "Test Site",
              tagline: "A great test site",
              hero: {
                headline: "Welcome to Our Site",
                subheadline: "Discover amazing things",
                ctaText: "Get Started",
                ctaLink: "/start",
              },
              features: {
                label: "Features",
                headline: "What We Offer",
                description: "Our key features",
                features: [
                  {
                    icon: "star",
                    title: "Feature 1",
                    description: "First feature",
                  },
                  {
                    icon: "heart",
                    title: "Feature 2",
                    description: "Second feature",
                  },
                ],
              },
              products: {
                label: "Products",
                headline: "Our Products",
                description: "What we build",
                products: [
                  {
                    id: "product1",
                    name: "Product One",
                    tagline: "The first product",
                    description: "A great product",
                    status: "live",
                    icon: "box",
                  },
                ],
              },
              cta: {
                headline: "Ready to Start?",
                description: "Join us today",
                primaryButton: { text: "Sign Up", link: "/signup" },
              },
            },
            "webserver:dashboard": {
              title: "Dashboard",
              description: "Your overview",
              stats: {
                entityCount: 42,
                entityTypeCount: 5,
                lastUpdated: new Date().toISOString(),
              },
              recentEntities: [
                {
                  id: "entity1",
                  title: "Recent Item 1",
                  created: new Date().toISOString(),
                },
                {
                  id: "entity2",
                  title: "Recent Item 2",
                  created: new Date().toISOString(),
                },
              ],
            },
          };

          if (contents[contentType]) {
            return contents[contentType];
          }
          throw new Error(`Unknown content type: ${contentType}`);
        }),
        getTemplate: mock((contentType) => {
          // Return template info based on content type
          if (contentType === "webserver:landing") {
            return {
              name: "landing-page",
              description: "Landing page",
              schema: {},
              items: {
                hero: {},
                features: {},
                products: {},
                cta: {},
              },
            };
          } else if (
            contentType === "webserver:general" ||
            contentType === "webserver:dashboard"
          ) {
            return {
              name: contentType.split(":")[1],
              description: `${contentType} template`,
              schema: {},
            };
          }
          return null;
        }),
      },
      contentTypeRegistry: {
        getFormatter: mock((contentType) => {
          if (contentType === "webserver:general") {
            // Use the actual formatter for general context
            const formatter = new GeneralContextFormatter();
            return formatter;
          }
          // Simple formatter that converts to YAML for others
          return {
            format: (data: unknown): string => yaml.dump(data),
            canFormat: (): boolean => true,
          };
        }),
      },
    } as unknown as PluginContext;
  }

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("initialization", () => {
    it("should create content directories when initialized", async () => {
      const context = createMockContext();
      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      await contentGenerator.generateAll();

      // Verify directory structure was created
      expect(existsSync(join(testDir, "src/content"))).toBe(true);
      expect(existsSync(join(testDir, "src/content/landing"))).toBe(true);
      expect(existsSync(join(testDir, "src/content/dashboard"))).toBe(true);
    });
  });

  describe("content generation", () => {
    it("should generate landing page content", async () => {
      const context = createMockContext();
      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      await contentGenerator.generateLandingPage();

      // Verify landing page was created
      const landingPath = join(testDir, "src/content/landing/index.yaml");
      expect(existsSync(landingPath)).toBe(true);

      // Verify content structure
      const content = yaml.load(await readFile(landingPath, "utf-8")) as Record<
        string,
        unknown
      >;
      expect(content["title"]).toBeDefined();
      expect(content["hero"]).toBeDefined();
      expect(content["features"]).toBeDefined();
      expect(content["products"]).toBeDefined();
      expect(content["cta"]).toBeDefined();
    });

    it("should generate dashboard content with real-time stats", async () => {
      const context = createMockContext();

      // Add some entities to the mock by creating them
      await context.entityService.createEntity({
        entityType: "note",
        content: "Note 1",
      });
      await context.entityService.createEntity({
        entityType: "note",
        content: "Note 2",
      });
      await context.entityService.createEntity({
        entityType: "article",
        content: "Article 1",
      });

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      await contentGenerator.generateDashboard();

      // Verify dashboard was created
      const dashboardPath = join(testDir, "src/content/dashboard/index.yaml");
      expect(existsSync(dashboardPath)).toBe(true);

      // Verify it contains stats
      const content = yaml.load(
        await readFile(dashboardPath, "utf-8"),
      ) as DashboardData;
      expect(content.title).toBe("Test Site");
      expect(content.stats).toBeDefined();
      expect(content.stats.entityCount).toBeGreaterThan(0);
    });

    it("should generate all content in correct order", async () => {
      const context = createMockContext();
      const callOrder: string[] = [];

      // Track the order of content generation
      context.contentGenerationService.generateContent = mock(
        async (contentType) => {
          callOrder.push(contentType);
          const defaultMock =
            createMockContext().contentGenerationService.generateContent;
          return defaultMock(contentType);
        },
      );

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      await contentGenerator.generateAll();

      // Verify general context is generated/checked first
      expect(callOrder[0]).toBe("webserver:general");

      // Verify other content is generated after
      expect(callOrder).toContain("webserver:landing");

      // Verify files were created
      expect(existsSync(join(testDir, "src/content/landing/index.yaml"))).toBe(
        true,
      );
      expect(
        existsSync(join(testDir, "src/content/dashboard/index.yaml")),
      ).toBe(true);
    });
  });

  describe("caching behavior", () => {
    it("should not regenerate existing content without force flag", async () => {
      const context = createMockContext();
      let generateCallCount = 0;

      context.contentGenerationService.generateContent = mock(
        async (contentType) => {
          generateCallCount++;
          const defaultMock =
            createMockContext().contentGenerationService.generateContent;
          return defaultMock(contentType);
        },
      );

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      // First generation
      await contentGenerator.generateAll();
      const firstCallCount = generateCallCount;

      // Second generation without force - should use cached general context
      await contentGenerator.generateAll(undefined, false);

      // Should have fewer calls since general context is reused
      expect(generateCallCount).toBeLessThan(firstCallCount * 2);
    });

    it("should regenerate all content with force flag", async () => {
      const context = createMockContext();
      let generateCallCount = 0;

      context.contentGenerationService.generateContent = mock(
        async (contentType) => {
          generateCallCount++;
          const defaultMock =
            createMockContext().contentGenerationService.generateContent;
          return defaultMock(contentType);
        },
      );

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      // First generation
      await contentGenerator.generateAll();
      const firstCallCount = generateCallCount;

      // Second generation with force
      generateCallCount = 0;
      await contentGenerator.generateAll(undefined, true);

      // Should regenerate everything
      expect(generateCallCount).toBe(firstCallCount);
    });
  });

  describe("error handling", () => {
    it("should fail if general context cannot be generated", async () => {
      const context = createMockContext();

      // Make general context generation fail
      context.contentGenerationService.generateContent = mock(
        async (contentType) => {
          if (contentType === "webserver:general") {
            throw new Error("Failed to generate general context");
          }
          const defaultMock =
            createMockContext().contentGenerationService.generateContent;
          return defaultMock(contentType);
        },
      );

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      // Should throw an error
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(contentGenerator.generateAll()).rejects.toThrow(
        "Failed to generate general context",
      );
    });

    it("should handle missing formatter gracefully", async () => {
      const context = createMockContext();

      // Remove formatter
      context.contentTypeRegistry.getFormatter = mock(() => null);

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      // Should still work - falls back to YAML
      await contentGenerator.generateContent("webserver:dashboard");

      const dashboardPath = join(testDir, "src/content/dashboard/index.yaml");
      expect(existsSync(dashboardPath)).toBe(true);
    });
  });

  describe("progress reporting", () => {
    it("should report progress during generation", async () => {
      const context = createMockContext();
      const progressReports: ProgressNotification[] = [];

      contentGenerator = new ContentGenerator({
        logger: createSilentLogger("test"),
        context,
        astroSiteDir: testDir,
        siteTitle: "Test Site",
        siteDescription: "Test Description",
      });

      await contentGenerator.generateAll(async (progress) => {
        progressReports.push(progress);
      });

      // Should have progress reports
      expect(progressReports.length).toBeGreaterThan(0);

      // Should have meaningful messages
      expect(
        progressReports.some((p) =>
          p.message?.includes("organizational context"),
        ),
      ).toBe(true);
      expect(
        progressReports.some((p) => p.message?.includes("landing page")),
      ).toBe(true);
      expect(
        progressReports.some((p) => p.message?.includes("dashboard")),
      ).toBe(true);
      expect(progressReports.some((p) => p.message?.includes("complete"))).toBe(
        true,
      );
    });
  });
});
