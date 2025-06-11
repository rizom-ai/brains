import type { EntityService } from "@brains/shell/src/entity/entityService";
import type { ContentTypeRegistry } from "@brains/shell/src/content";
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
  private contentTypeRegistry?: ContentTypeRegistry;

  constructor(private registry: Registry) {}

  private getEntityService(): EntityService {
    this.entityService ??= this.registry.resolve<EntityService>("entityService");
    return this.entityService;
  }

  private getContentTypeRegistry(): ContentTypeRegistry {
    this.contentTypeRegistry ??= this.registry.resolve<ContentTypeRegistry>("contentTypeRegistry");
    return this.contentTypeRegistry;
  }

  private parseGeneratedContent(entity: GeneratedContent): unknown | null {
    try {
      const contentTypeRegistry = this.getContentTypeRegistry();
      const formatter = contentTypeRegistry.getFormatter(entity.contentType);
      
      if (formatter) {
        return formatter.parse(entity.content);
      } else {
        // Try JSON parse as fallback
        return JSON.parse(entity.content);
      }
    } catch (error) {
      console.error("Failed to parse generated content", { 
        contentType: entity.contentType,
        error 
      });
      return null;
    }
  }

  /**
   * Resolve landing page reference data to full landing page data
   */
  public async resolveLandingPage(
    referenceData: LandingPageReferenceData,
  ): Promise<LandingPageData> {
    const entityService = this.getEntityService();

    console.log("Resolving landing page with reference data:", referenceData);

    // Sections are stored as generated-content entities
    const [heroEntity, featuresEntity, ctaEntity] = await Promise.all([
      entityService.getEntity<GeneratedContent>(
        "generated-content",
        referenceData.heroId,
      ),
      entityService.getEntity<GeneratedContent>(
        "generated-content",
        referenceData.featuresId,
      ),
      entityService.getEntity<GeneratedContent>(
        "generated-content",
        referenceData.ctaId,
      ),
    ]);

    console.log("Fetched entities:", {
      hero: heroEntity?.id,
      features: featuresEntity?.id,
      cta: ctaEntity?.id,
      featuresData: featuresEntity ? this.parseGeneratedContent(featuresEntity) : null,
    });

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
    const heroData = heroEntity ? this.parseGeneratedContent(heroEntity) : null;
    const hero = heroData
      ? landingHeroDataSchema.parse(heroData)
      : defaultHero;

    const featuresData = featuresEntity ? this.parseGeneratedContent(featuresEntity) : null;
    const features = featuresData
      ? featuresSectionSchema.parse(featuresData)
      : defaultFeatures;

    const ctaData = ctaEntity ? this.parseGeneratedContent(ctaEntity) : null;
    const cta = ctaData
      ? ctaSectionSchema.parse(ctaData)
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
