import { EntityService } from "@brains/shell/src/entity/entityService";
import type { Registry } from "@brains/types";
import type { 
  LandingPageReferenceData, 
  LandingPageData,
  LandingHeroData,
  FeaturesSection,
  CTASection
} from "./content-schemas";

/**
 * Service to resolve entity references for composite content
 */
export class EntityResolver {
  private entityService?: EntityService;

  constructor(private registry: Registry) {}

  private getEntityService(): EntityService {
    if (!this.entityService) {
      this.entityService = this.registry.resolve<EntityService>("entityService");
    }
    if (!this.entityService) {
      throw new Error("EntityService not available");
    }
    return this.entityService;
  }

  /**
   * Resolve landing page reference data to full landing page data
   */
  public async resolveLandingPage(referenceData: LandingPageReferenceData): Promise<LandingPageData> {
    const entityService = this.getEntityService();
    
    const [heroEntity, featuresEntity, ctaEntity] = await Promise.all([
      entityService.getEntity(referenceData.heroId, "hero-section"),
      entityService.getEntity(referenceData.featuresId, "features-section"),
      entityService.getEntity(referenceData.ctaId, "cta-section"),
    ]);

    const landingPageData: LandingPageData = {
      title: referenceData.title,
      tagline: referenceData.tagline,
      hero: {} as LandingHeroData,
      features: {} as FeaturesSection,
      cta: {} as CTASection,
    };

    // Extract section data from entities
    if (heroEntity) {
      // Parse the entity content to get the section data
      const adapter = this.registry.resolve<any>("entityAdapterRegistry").getAdapter("hero-section");
      landingPageData.hero = adapter.fromMarkdown(heroEntity.content) as LandingHeroData;
    }
    if (featuresEntity) {
      const adapter = this.registry.resolve<any>("entityAdapterRegistry").getAdapter("features-section");
      landingPageData.features = adapter.fromMarkdown(featuresEntity.content) as FeaturesSection;
    }
    if (ctaEntity) {
      const adapter = this.registry.resolve<any>("entityAdapterRegistry").getAdapter("cta-section");
      landingPageData.cta = adapter.fromMarkdown(ctaEntity.content) as CTASection;
    }

    return landingPageData;
  }
}