/**
 * Provides fallback content for landing page sections that fail to generate
 * This ensures the landing page remains functional even when individual sections fail
 */
export class FallbackContentGenerator {
  private static instance: FallbackContentGenerator | null = null;

  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {}

  /**
   * Get singleton instance of the FallbackContentGenerator
   */
  static getInstance(): FallbackContentGenerator {
    if (!FallbackContentGenerator.instance) {
      FallbackContentGenerator.instance = new FallbackContentGenerator();
    }
    return FallbackContentGenerator.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    FallbackContentGenerator.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   */
  static createFresh(): FallbackContentGenerator {
    return new FallbackContentGenerator();
  }

  /**
   * Generate fallback content for a section that failed to generate
   * @param sectionName The name of the section (e.g., "hero", "services")
   * @returns Fallback content object for the specified section
   */
  getFallbackContent(sectionName: string): unknown {
    // Common fallback structure with consistent naming pattern
    const fallback = {
      title: `${this.formatSectionName(sectionName)}`,
      enabled: false, // Disable failed sections by default
    };

    // Section-specific fallback structure based on known section types
    switch (sectionName) {
    case 'hero':
      return {
        ...fallback,
        headline: 'Welcome to Our Website',
        subheading: 'This section is currently being updated',
        ctaText: 'Learn More',
        ctaLink: '#about',
      };
    case 'problemStatement':
      return {
        ...fallback,
        description: 'This section will outline key challenges we address.',
        enabled: false,
      };
    case 'services':
      return {
        ...fallback,
        items: [
          { 
            title: 'Service Example', 
            description: 'This is a placeholder for service content. Please regenerate this section for actual services.', 
          },
        ],
      };
    case 'process':
      return {
        ...fallback,
        steps: [
          {
            step: 1,
            title: 'Step Example',
            description: 'This is a placeholder for process steps. Please regenerate this section.',
          },
        ],
        enabled: false,
      };
    case 'caseStudies':
      return {
        ...fallback,
        items: [
          {
            title: 'Case Study Example',
            description: 'This is a placeholder for case study content.',
            result: 'Placeholder result',
          },
        ],
        enabled: false,
      };
    case 'expertise':
      return {
        ...fallback,
        items: [
          {
            title: 'Expertise Example',
            description: 'This is a placeholder for expertise content.',
          },
        ],
        enabled: false,
      };
    case 'about':
      return {
        ...fallback,
        content: 'This is a placeholder for the about section content. Please regenerate this section.',
        enabled: false,
      };
    case 'pricing':
      return {
        ...fallback,
        tiers: [
          {
            name: 'Basic',
            price: 'Contact for pricing',
            features: ['Feature 1', 'Feature 2'],
            cta: 'Contact Us',
            ctaLink: '#contact',
          },
        ],
        enabled: false,
      };
    case 'faq':
      return {
        ...fallback,
        items: [
          {
            question: 'What services do you offer?',
            answer: 'This is a placeholder for FAQ content. Please regenerate this section for actual FAQs.',
          },
        ],
        enabled: false,
      };
    case 'cta':
      return {
        ...fallback,
        title: 'Ready to Get Started?',
        buttonText: 'Contact Us',
        buttonLink: '#contact',
      };
    case 'footer':
      return {
        ...fallback,
        copyrightText: `© ${new Date().getFullYear()} Company Name`,
        contactDetails: {
          email: 'contact@example.com',
          phone: '',
          social: [],
        },
        links: [
          {
            text: 'Home',
            url: '/',
          },
          {
            text: 'Contact',
            url: '#contact',
          },
        ],
      };
    default:
      return fallback;
    }
  }

  /**
   * Helper to format section name for display
   * Handles various input formats (camelCase, kebab-case) and returns a properly capitalized title
   * @param sectionName The raw section name
   * @returns Formatted section name for display
   */
  private formatSectionName(sectionName: string): string {
    return sectionName
      // First handle kebab-case by replacing hyphens with spaces
      .replace(/-/g, ' ')
      // Then handle camelCase (e.g., "heroSection" -> "hero Section")
      .replace(/([A-Z])/g, ' $1')
      // Split into words, capitalize each, and join
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

export default FallbackContentGenerator;