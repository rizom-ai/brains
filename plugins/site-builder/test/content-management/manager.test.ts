import { describe, it, expect, beforeEach } from "bun:test";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type {
  RouteDefinition,
  SectionDefinition,
} from "@brains/view-registry";
import type {
  SiteContentPreview,
  SiteContentProduction,
} from "../../src/types";
import { SiteContentManager } from "../../src/content-management/manager";

// Mock EntityService
class MockEntityService {
  private entities = new Map<
    string,
    SiteContentPreview | SiteContentProduction
  >();

  async createEntity<T extends SiteContentPreview | SiteContentProduction>(
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    },
  ): Promise<T> {
    const id =
      entity.id ??
      `${entity.entityType}:${(entity as SiteContentPreview | SiteContentProduction).page}:${(entity as SiteContentPreview | SiteContentProduction).section}`;
    const now = new Date().toISOString();
    const fullEntity = {
      ...entity,
      id,
      created: entity.created ?? now,
      updated: entity.updated ?? now,
    } as T;

    this.entities.set(id, fullEntity);
    return fullEntity;
  }

  async updateEntity<T extends SiteContentPreview | SiteContentProduction>(
    entity: T,
  ): Promise<T> {
    const updatedEntity = {
      ...entity,
      updated: new Date().toISOString(),
    };
    this.entities.set(entity.id, updatedEntity);
    return updatedEntity;
  }

  async getEntity<T extends SiteContentPreview | SiteContentProduction>(
    _entityType: string,
    id: string,
  ): Promise<T | null> {
    const entity = this.entities.get(id);
    return entity ? (entity as T) : null;
  }

  async deleteEntity(id: string): Promise<boolean> {
    return this.entities.delete(id);
  }

  async listEntities<T extends SiteContentPreview | SiteContentProduction>(
    entityType: string,
    options?: { filter?: { metadata: Record<string, unknown> } },
  ): Promise<T[]> {
    const results: T[] = [];

    for (const [, entity] of this.entities) {
      if (entity.entityType === entityType) {
        // Apply metadata filter if provided
        if (options?.filter?.metadata) {
          const metadata = options.filter.metadata;
          let matches = true;

          for (const [key, value] of Object.entries(metadata)) {
            if ((entity as Record<string, unknown>)[key] !== value) {
              matches = false;
              break;
            }
          }

          if (matches) {
            results.push(entity as T);
          }
        } else {
          results.push(entity as T);
        }
      }
    }

    return results;
  }

  // Helper method for tests
  setEntity(
    id: string,
    entity: SiteContentPreview | SiteContentProduction,
  ): void {
    this.entities.set(id, entity);
  }

  // Helper method for tests
  clear(): void {
    this.entities.clear();
  }
}

describe("SiteContentManager", () => {
  let entityService: MockEntityService;
  let manager: SiteContentManager;

  const previewEntity: SiteContentPreview = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    content: "# Hero Section\n\nWelcome to our site!",
    page: "landing",
    section: "hero",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T01:00:00Z",
  };

  const productionEntity: SiteContentProduction = {
    id: "site-content-production:landing:hero",
    entityType: "site-content-production",
    content: "# Hero Section\n\nOld production content",
    page: "landing",
    section: "hero",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:30:00Z",
  };

  beforeEach(() => {
    entityService = new MockEntityService();
    manager = new SiteContentManager(entityService as unknown as EntityService);
  });

  describe("promote", () => {
    it("should promote preview content to new production entity", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);

      const result = await manager.promote({ dryRun: false });

      expect(result.success).toBe(true);
      expect(result.promoted).toHaveLength(1);
      expect(result.promoted[0]).toEqual({
        page: "landing",
        section: "hero",
        previewId: "site-content-preview:landing:hero",
        productionId: "site-content-production:landing:hero",
      });
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toEqual([]);

      // Check that production entity was created
      const productionEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(productionEntity).toBeDefined();
      expect(productionEntity?.content).toBe(previewEntity.content);
    });

    it("should update existing production content", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.promote({ dryRun: false });

      expect(result.success).toBe(true);
      expect(result.promoted).toHaveLength(1);

      // Check that production entity was updated with preview content
      const updatedProduction = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(updatedProduction?.content).toBe(previewEntity.content);
      expect(updatedProduction?.content).not.toBe(productionEntity.content);
    });

    it("should filter by page", async () => {
      const aboutPreview: SiteContentPreview = {
        ...previewEntity,
        id: "site-content-preview:about:team",
        page: "about",
        section: "team",
      };

      entityService.setEntity(previewEntity.id, previewEntity);
      entityService.setEntity(aboutPreview.id, aboutPreview);

      const result = await manager.promote({ page: "landing", dryRun: false });

      expect(result.success).toBe(true);
      expect(result.promoted).toHaveLength(1);
      expect(result.promoted[0]?.page).toBe("landing");
    });

    it("should filter by section", async () => {
      const featuresPreview: SiteContentPreview = {
        ...previewEntity,
        id: "site-content-preview:landing:features",
        section: "features",
      };

      entityService.setEntity(previewEntity.id, previewEntity);
      entityService.setEntity(featuresPreview.id, featuresPreview);

      const result = await manager.promote({ section: "hero", dryRun: false });

      expect(result.success).toBe(true);
      expect(result.promoted).toHaveLength(1);
      expect(result.promoted[0]?.section).toBe("hero");
    });

    it("should handle dry run", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);

      const result = await manager.promote({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.promoted).toHaveLength(0);

      // Check that no production entity was created
      const productionEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(productionEntity).toBeNull();
    });
  });

  describe("rollback", () => {
    it("should delete production content", async () => {
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.rollback({ dryRun: false });

      expect(result.success).toBe(true);
      expect(result.rolledBack).toHaveLength(1);
      expect(result.rolledBack[0]).toEqual({
        page: "landing",
        section: "hero",
        productionId: "site-content-production:landing:hero",
      });

      // Check that production entity was deleted
      const deletedEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(deletedEntity).toBeNull();
    });

    it("should filter by page", async () => {
      const aboutProduction: SiteContentProduction = {
        ...productionEntity,
        id: "site-content-production:about:team",
        page: "about",
        section: "team",
      };

      entityService.setEntity(productionEntity.id, productionEntity);
      entityService.setEntity(aboutProduction.id, aboutProduction);

      const result = await manager.rollback({ page: "landing", dryRun: false });

      expect(result.success).toBe(true);
      expect(result.rolledBack).toHaveLength(1);
      expect(result.rolledBack[0]?.page).toBe("landing");

      // Check that only landing page was deleted
      const landingEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      const aboutEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:about:team",
      );
      expect(landingEntity).toBeNull();
      expect(aboutEntity).toBeDefined();
    });

    it("should handle dry run", async () => {
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.rollback({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.rolledBack).toHaveLength(0);

      // Check that production entity still exists
      const existingEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(existingEntity).toBeDefined();
    });
  });

  describe("compare", () => {
    it("should compare preview and production content", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.compare("landing", "hero");

      expect(result).toBeDefined();
      expect(result?.page).toBe("landing");
      expect(result?.section).toBe("hero");
      expect(result?.preview).toEqual(previewEntity);
      expect(result?.production).toEqual(productionEntity);
      expect(result?.identical).toBe(false);
      expect(result?.differences.some((d) => d.field === "content")).toBe(true);
    });

    it("should return null when preview doesn't exist", async () => {
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.compare("landing", "hero");

      expect(result).toBeNull();
    });

    it("should return null when production doesn't exist", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);

      const result = await manager.compare("landing", "hero");

      expect(result).toBeNull();
    });
  });

  describe("exists", () => {
    it("should return true when preview content exists", async () => {
      entityService.setEntity(previewEntity.id, previewEntity);

      const result = await manager.exists("landing", "hero", "preview");

      expect(result).toBe(true);
    });

    it("should return true when production content exists", async () => {
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.exists("landing", "hero", "production");

      expect(result).toBe(true);
    });

    it("should return false when content doesn't exist", async () => {
      const result = await manager.exists("nonexistent", "section", "preview");

      expect(result).toBe(false);
    });
  });

  describe("generate", () => {
    const mockRoutes = [
      {
        id: "landing",
        path: "/landing",
        title: "Landing Page",
        description: "Main landing page",
        sections: [
          {
            id: "hero",
            template: "hero",
            contentEntity: {
              entityType: "site-content-preview",
              query: { page: "landing", section: "hero" },
            },
          },
          {
            id: "features",
            template: "features",
            contentEntity: {
              entityType: "site-content-preview",
              query: { page: "landing", section: "features" },
            },
          },
        ],
      },
      {
        id: "about",
        path: "/about",
        title: "About Page",
        description: "About us page",
        sections: [
          {
            id: "team",
            template: "team",
            contentEntity: {
              entityType: "site-content-preview",
              query: { page: "about", section: "team" },
            },
          },
        ],
      },
    ];

    const mockGenerateCallback = async (
      route: RouteDefinition,
      section: SectionDefinition,
    ): Promise<{
      content: string;
    }> => {
      if (!section.contentEntity) {
        throw new Error("contentEntity is required");
      }
      return {
        content: `Generated content for ${route.title} - ${section.id}`,
      };
    };

    it("should generate content for all sections", async () => {
      const result = await manager.generate(
        { dryRun: false },
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(3);
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(3);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toEqual([]);

      // Check that entities were created
      const heroEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      const featuresEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:features",
      );
      const teamEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:about:team",
      );

      expect(heroEntity).toBeDefined();
      expect(featuresEntity).toBeDefined();
      expect(teamEntity).toBeDefined();
    });

    it("should filter by page", async () => {
      const result = await manager.generate(
        { page: "landing", dryRun: false },
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(2);
      expect(result.totalSections).toBe(2);
      expect(result.generated).toHaveLength(2);
      expect(result.generated.every((g) => g.page === "/landing")).toBe(true);
    });

    it("should filter by section", async () => {
      const result = await manager.generate(
        { section: "hero", dryRun: false },
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(1);
      expect(result.totalSections).toBe(1);
      expect(result.generated).toHaveLength(1);
      expect(result.generated[0]?.section).toBe("hero");
    });

    it("should skip existing content", async () => {
      // Pre-populate with existing content
      entityService.setEntity("site-content-preview:landing:hero", {
        id: "site-content-preview:landing:hero",
        entityType: "site-content-preview",
        content: "Existing content",
        page: "landing",
        section: "hero",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      const result = await manager.generate(
        { dryRun: false },
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(2); // Only features and team
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toBe("Content already exists");
    });

    it("should handle dry run", async () => {
      const result = await manager.generate(
        { dryRun: true },
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(3);
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(3);
      expect(
        result.generated.every((g) => g.entityId === "dry-run-entity-id"),
      ).toBe(true);

      // Check that no entities were actually created
      const heroEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(heroEntity).toBeNull();
    });

    it("should handle callback errors gracefully", async () => {
      const failingCallback = async (
        route: RouteDefinition,
        section: SectionDefinition,
      ): Promise<{
        content: string;
      }> => {
        if (section.id === "hero") {
          throw new Error("Template not found");
        }
        return mockGenerateCallback(route, section);
      };

      const result = await manager.generate(
        { dryRun: false },
        mockRoutes,
        failingCallback,
      );

      expect(result.success).toBe(false);
      expect(result.sectionsGenerated).toBe(2); // features and team succeeded
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain("Template not found");
    });

    it("should return early when no sections need content", async () => {
      const routesWithContent = mockRoutes.map((route): typeof route => ({
        ...route,
        sections: route.sections.map((section) => ({
          ...section,
          content: "Existing content", // All sections have content
        })),
      }));

      const result = await manager.generate(
        { dryRun: false },
        routesWithContent,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(0);
      expect(result.totalSections).toBe(0);
      expect(result.generated).toHaveLength(0);
      expect(result.message).toBe("No sections need content generation");
    });

    it("should generate content for all sections across all pages", async () => {
      const result = await manager.generateAll(
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(3);
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(3);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toEqual([]);

      // Check that entities were created
      const heroEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      const featuresEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:features",
      );
      const teamEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:about:team",
      );

      expect(heroEntity).toBeDefined();
      expect(featuresEntity).toBeDefined();
      expect(teamEntity).toBeDefined();
    });

    it("should skip existing content when generating all", async () => {
      // Pre-populate with existing content
      entityService.setEntity("site-content-preview:landing:hero", {
        id: "site-content-preview:landing:hero",
        entityType: "site-content-preview",
        content: "Existing content",
        page: "landing",
        section: "hero",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      const result = await manager.generateAll(
        mockRoutes,
        mockGenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.sectionsGenerated).toBe(2); // Only features and team
      expect(result.totalSections).toBe(3);
      expect(result.generated).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toBe("Content already exists");
    });
  });

  describe("regenerate", () => {
    const mockRegenerateCallback = async (
      entityType: string,
      page: string,
      section: string,
      mode: "leave" | "new" | "with-current",
      _progress: { current: number; total: number; message: string },
      currentContent?: string,
    ): Promise<{ entityId: string; content: string }> => {
      let newContent = `Regenerated content for ${page} - ${section}`;
      if (mode === "with-current" && currentContent) {
        newContent = `Improved: ${currentContent}`;
      }
      return {
        entityId: `${entityType}:${page}:${section}`,
        content: newContent,
      };
    };

    beforeEach((): void => {
      // Set up some existing entities
      entityService.setEntity("site-content-preview:landing:hero", {
        id: "site-content-preview:landing:hero",
        entityType: "site-content-preview",
        content: "Original hero content",
        page: "landing",
        section: "hero",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      entityService.setEntity("site-content-production:landing:hero", {
        id: "site-content-production:landing:hero",
        entityType: "site-content-production",
        content: "Original production hero content",
        page: "landing",
        section: "hero",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:30:00Z",
      });
    });

    it("should regenerate preview content with 'new' mode", async () => {
      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "new",
          dryRun: false,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(1);
      expect(result.regenerated[0]).toEqual({
        page: "landing",
        section: "hero",
        entityId: "site-content-preview:landing:hero",
        mode: "new",
      });

      // Check that content was updated
      const updatedEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(updatedEntity?.content).toBe(
        "Regenerated content for landing - hero",
      );
    });

    it("should regenerate content with 'with-current' mode", async () => {
      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "with-current",
          dryRun: false,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(1);

      // Check that content was improved based on current content
      const updatedEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(updatedEntity?.content).toBe("Improved: Original hero content");
    });

    it("should skip content with 'leave' mode", async () => {
      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "leave",
          dryRun: false,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.reason).toBe(
        "Mode 'leave' - content kept as-is",
      );

      // Check that content was not changed
      const unchangedEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(unchangedEntity?.content).toBe("Original hero content");
    });

    it("should only regenerate preview content (production comes from promotion)", async () => {
      // Set up production content that should NOT be regenerated
      entityService.setEntity("site-content-production:landing:hero", {
        id: "site-content-production:landing:hero",
        entityType: "site-content-production",
        content: "Original production content",
        page: "landing",
        section: "hero",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "new",
          dryRun: false,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(1);
      // Only preview content should be regenerated
      expect(result.regenerated[0]?.entityId).toBe(
        "site-content-preview:landing:hero",
      );

      // Production content should remain unchanged
      const productionEntity = await entityService.getEntity(
        "site-content-production",
        "site-content-production:landing:hero",
      );
      expect(productionEntity?.content).toBe("Original production content");
    });

    it("should handle dry run", async () => {
      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "new",
          dryRun: true,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(1);

      // Check that content was not actually changed
      const unchangedEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(unchangedEntity?.content).toBe("Original hero content");
    });

    it("should handle callback errors gracefully", async () => {
      const failingCallback = async (
        _entityType: string,
        _page: string,
        _section: string,
        _mode: "leave" | "new" | "with-current",
        _progress: { current: number; total: number; message: string },
        _currentContent?: string,
      ): Promise<never> => {
        throw new Error("Template not found");
      };

      const result = await manager.regenerate(
        {
          page: "landing",
          section: "hero",
          environment: "preview",
          mode: "new",
          dryRun: false,
        },
        failingCallback,
      );

      expect(result.success).toBe(false);
      expect(result.regenerated).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain("Template not found");
    });

    it("should regenerate all sections for a page when section not specified", async () => {
      // Add another section for the same page
      entityService.setEntity("site-content-preview:landing:features", {
        id: "site-content-preview:landing:features",
        entityType: "site-content-preview",
        content: "Original features content",
        page: "landing",
        section: "features",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      const result = await manager.regenerate(
        {
          page: "landing",
          environment: "preview",
          mode: "new",
          dryRun: false,
        },
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.regenerated).toHaveLength(2);
      expect(result.regenerated.some((r) => r.section === "hero")).toBe(true);
      expect(result.regenerated.some((r) => r.section === "features")).toBe(
        true,
      );
    });

    it("should regenerate all content with 'new' mode", async () => {
      // Set up additional content for multiple pages
      entityService.setEntity("site-content-preview:about:team", {
        id: "site-content-preview:about:team",
        entityType: "site-content-preview",
        content: "Original about team content",
        page: "about",
        section: "team",
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T01:00:00Z",
      });

      const result = await manager.regenerateAll("new", mockRegenerateCallback);

      expect(result.success).toBe(true);
      expect(result.totalPages).toBeGreaterThan(0);
      expect(result.regenerated.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // Check that content was updated
      const updatedPreviewEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(updatedPreviewEntity?.content).toBe(
        "Regenerated content for landing - hero",
      );
    });

    it("should handle dry run for regenerate all", async () => {
      const result = await manager.regenerateAll(
        "new",
        mockRegenerateCallback,
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      expect(result.totalPages).toBeGreaterThan(0);
      expect(result.regenerated.length).toBeGreaterThan(0);

      // Check that content was not actually changed
      const unchangedEntity = await entityService.getEntity(
        "site-content-preview",
        "site-content-preview:landing:hero",
      );
      expect(unchangedEntity?.content).toBe("Original hero content");
    });

    it("should skip content with 'leave' mode for regenerate all", async () => {
      const result = await manager.regenerateAll(
        "leave",
        mockRegenerateCallback,
      );

      expect(result.success).toBe(true);
      expect(result.totalPages).toBeGreaterThan(0);
      expect(result.skipped.length).toBeGreaterThan(0);
      expect(result.regenerated).toHaveLength(0);

      // All skipped items should have the leave reason
      expect(
        result.skipped.every(
          (s) => s.reason === "Mode 'leave' - content kept as-is",
        ),
      ).toBe(true);
    });
  });

  describe("generateId", () => {
    it("should generate correct preview ID", () => {
      const id = manager.generateId("site-content-preview", "landing", "hero");
      expect(id).toBe("site-content-preview:landing:hero");
    });

    it("should generate correct production ID", () => {
      const id = manager.generateId("site-content-production", "about", "team");
      expect(id).toBe("site-content-production:about:team");
    });
  });
});
