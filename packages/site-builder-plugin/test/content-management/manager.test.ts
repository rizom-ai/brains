import { describe, it, expect, beforeEach } from "bun:test";
import type { EntityService, SiteContentPreview, SiteContentProduction } from "@brains/types";
import { SiteContentManager } from "../../src/content-management/manager";

// Mock EntityService
class MockEntityService {
  private entities = new Map<string, SiteContentPreview | SiteContentProduction>();

  async createEntity<T extends SiteContentPreview | SiteContentProduction>(
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    }
  ): Promise<T> {
    const id = entity.id || `${entity.entityType}:${(entity as SiteContentPreview | SiteContentProduction).page}:${(entity as SiteContentPreview | SiteContentProduction).section}`;
    const now = new Date().toISOString();
    const fullEntity = {
      ...entity,
      id,
      created: entity.created || now,
      updated: entity.updated || now,
    } as T;

    this.entities.set(id, fullEntity);
    return fullEntity;
  }

  async updateEntity<T extends SiteContentPreview | SiteContentProduction>(entity: T): Promise<T> {
    const updatedEntity = {
      ...entity,
      updated: new Date().toISOString(),
    };
    this.entities.set(entity.id, updatedEntity);
    return updatedEntity;
  }

  async getEntity<T extends SiteContentPreview | SiteContentProduction>(_entityType: string, id: string): Promise<T | null> {
    const entity = this.entities.get(id);
    return (entity as T) || null;
  }

  async deleteEntity(id: string): Promise<boolean> {
    return this.entities.delete(id);
  }

  async listEntities<T extends SiteContentPreview | SiteContentProduction>(
    entityType: string, 
    options?: { filter?: { metadata: Record<string, unknown> } }
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
  setEntity(id: string, entity: SiteContentPreview | SiteContentProduction): void {
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
      const productionEntity = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
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
      const updatedProduction = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
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
      const productionEntity = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
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
      const deletedEntity = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
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
      const landingEntity = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
      const aboutEntity = await entityService.getEntity("site-content-production", "site-content-production:about:team");
      expect(landingEntity).toBeNull();
      expect(aboutEntity).toBeDefined();
    });

    it("should handle dry run", async () => {
      entityService.setEntity(productionEntity.id, productionEntity);

      const result = await manager.rollback({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.rolledBack).toHaveLength(0);

      // Check that production entity still exists
      const existingEntity = await entityService.getEntity("site-content-production", "site-content-production:landing:hero");
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
      expect(result?.differences.some(d => d.field === "content")).toBe(true);
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