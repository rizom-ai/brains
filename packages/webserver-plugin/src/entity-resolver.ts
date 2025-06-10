import type { EntityService } from "@brains/shell/src/entity/entityService";
import type { Registry, GeneratedContent } from "@brains/types";
import {
  type LandingPageReferenceData,
  type LandingPageData,
  type LandingHeroData,
  type FeaturesSection,
  type CTASection,
  landingHeroDataSchema,
  featuresSectionSchema,
  ctaSectionSchema,
} from "./content-schemas";

/**
 * Service to resolve entity references for composite content
 */
export class EntityResolver {
  private entityService?: EntityService;

  constructor(private registry: Registry) {}

  private getEntityService(): EntityService {
    if (!this.entityService) {
      this.entityService =
        this.registry.resolve<EntityService>("entityService");
    }
    if (!this.entityService) {
      throw new Error("EntityService not available");
    }
    return this.entityService;
  }

  /**
   * Resolve landing page reference data to full landing page data
   */
  public async resolveLandingPage(
    referenceData: LandingPageReferenceData,
  ): Promise<LandingPageData> {
    const entityService = this.getEntityService();

    // Sections are stored as generated-content entities
    const [heroEntity, featuresEntity, ctaEntity] = await Promise.all([
      entityService.getEntity<GeneratedContent>("generated-content", referenceData.heroId),
      entityService.getEntity<GeneratedContent>("generated-content", referenceData.featuresId),
      entityService.getEntity<GeneratedContent>("generated-content", referenceData.ctaId),
    ]);

    // Create default sections as fallbacks
    const defaultHero: LandingHeroData = {
      headline: "Welcome",
      subheadline: "Get started with your digital brain",
      ctaText: "Get Started",
      ctaLink: "/dashboard",
    };

    const defaultFeatures: FeaturesSection = {
      label: "Features",
      headline: "Everything you need",
      description: "Powerful features to organize and access your knowledge",
      features: [
        {
          title: "Smart Organization",
          description: "Automatically organize your knowledge",
          icon: "🧠",
        },
      ],
    };

    const defaultCta: CTASection = {
      headline: "Ready to get started?",
      description: "Start building your digital brain today",
      primaryButton: {
        text: "Get Started",
        link: "/dashboard",
      },
    };

    // Parse and validate section data using schemas
    const hero = heroEntity?.data
      ? landingHeroDataSchema.parse(heroEntity.data)
      : defaultHero;

    const features = featuresEntity?.data
      ? featuresSectionSchema.parse(featuresEntity.data)
      : defaultFeatures;

    const cta = ctaEntity?.data
      ? ctaSectionSchema.parse(ctaEntity.data)
      : defaultCta;

    const landingPageData: LandingPageData = {
      title: referenceData.title,
      tagline: referenceData.tagline,
      hero,
      features,
      cta,
    };

    return landingPageData;
  }
}
