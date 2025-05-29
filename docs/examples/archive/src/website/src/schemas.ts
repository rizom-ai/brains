import { z } from 'zod';

/**
 * Section schemas for the landing page structure
 */

// Hero section schema
export const HeroSectionSchema = z.object({
  headline: z.string(),
  subheading: z.string(),
  ctaText: z.string(),
  ctaLink: z.string().default('#contact'),
  imageUrl: z.string().optional(),
});

// Problem statement section schema
export const ProblemStatementSectionSchema = z.object({
  title: z.string(),
  description: z.string(),
  bulletPoints: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
});

// Service item schema
export const ServiceItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  details: z.string().optional(),
});

// Services section schema
export const ServicesSectionSchema = z.object({
  title: z.string().default('Services'),
  introduction: z.string().optional(),
  items: z.array(ServiceItemSchema),
});

// Process step schema
export const ProcessStepSchema = z.object({
  step: z.number(),
  title: z.string(),
  description: z.string(),
});

// Process section schema
export const ProcessSectionSchema = z.object({
  title: z.string().default('How I Work'),
  introduction: z.string().optional(),
  steps: z.array(ProcessStepSchema),
  enabled: z.boolean().default(true),
});

// Case study item schema
export const CaseStudyItemSchema = z.object({
  title: z.string(),
  challenge: z.string(),
  approach: z.string(),
  results: z.string(),
  client: z.string().optional(),
  imageUrl: z.string().optional(),
});

// Case studies section schema
export const CaseStudiesSectionSchema = z.object({
  title: z.string().default('Selected Projects'),
  introduction: z.string().optional(),
  items: z.array(CaseStudyItemSchema),
  clientLogos: z.array(z.object({
    name: z.string(),
    imageUrl: z.string().optional(),
  })).optional(),
  enabled: z.boolean().default(true),
});

// Expertise item schema
export const ExpertiseItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
});

// Expertise section schema - simplified to essential content with reasonable limits
export const ExpertiseSectionSchema = z.object({
  title: z.string().default('Expertise'),
  introduction: z.string().optional(),
  // Limit to between 3-5 items for a focused presentation
  items: z.array(ExpertiseItemSchema).min(3).max(5),
  enabled: z.boolean().default(true),
});

// About section schema
export const AboutSectionSchema = z.object({
  title: z.string().default('About Me'),
  content: z.string(),
  imageUrl: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  enabled: z.boolean().default(true),
});

// Pricing tier schema
export const PricingTierSchema = z.object({
  name: z.string(),
  price: z.string().optional(), // Optional as some consultants don't list prices
  description: z.string(),
  features: z.array(z.string()),
  isFeatured: z.boolean().default(false),
  ctaText: z.string().default('Contact Me'),
  ctaLink: z.string().default('#contact'),
});

// Pricing section schema
export const PricingSectionSchema = z.object({
  title: z.string().default('Packages & Pricing'),
  introduction: z.string().optional(),
  tiers: z.array(PricingTierSchema),
  enabled: z.boolean().default(false), // Disabled by default as it's optional
});

// FAQ item schema
export const FaqItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

// FAQ section schema - simplified with reasonable limits
export const FaqSectionSchema = z.object({
  title: z.string().default('Frequently Asked Questions'),
  introduction: z.string().optional(),
  // Limit to between 3-7 items for a good balance of content
  items: z.array(FaqItemSchema).min(3).max(7),
  enabled: z.boolean().default(true),
});

// Call-to-action section schema
export const CtaSectionSchema = z.object({
  title: z.string().default('Ready to Get Started?'),
  subtitle: z.string().optional(),
  buttonText: z.string().default('Contact Me'),
  buttonLink: z.string().default('#contact'),
  enabled: z.boolean().default(true),
});

// Contact details schema
export const ContactDetailsSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  social: z.array(z.object({
    platform: z.string(),
    url: z.string(),
    icon: z.string().optional(),
  })).optional(),
});

// Footer section schema
export const FooterSectionSchema = z.object({
  contactDetails: ContactDetailsSchema.optional(),
  copyrightText: z.string().optional(),
  links: z.array(z.object({
    text: z.string(),
    url: z.string(),
  })).optional(),
  enabled: z.boolean().default(true),
});

// Landing page data schema
export const LandingPageSchema = z.object({
  // Basic information
  title: z.string(),
  description: z.string(),
  name: z.string(),
  tagline: z.string(),

  // Section order - defines which sections appear and in what order
  sectionOrder: z.array(z.string()).default([
    'hero',
    'problemStatement',
    'services',
    'process',
    'caseStudies',
    'expertise',
    'about',
    'pricing',
    'faq',
    'cta',
    'footer',
  ]),

  // Sections - all required but can be disabled with the 'enabled' property
  hero: HeroSectionSchema,
  problemStatement: ProblemStatementSectionSchema,
  services: ServicesSectionSchema,
  process: ProcessSectionSchema,
  caseStudies: CaseStudiesSectionSchema,
  expertise: ExpertiseSectionSchema,
  about: AboutSectionSchema,
  pricing: PricingSectionSchema,
  faq: FaqSectionSchema,
  cta: CtaSectionSchema,
  footer: FooterSectionSchema,
});

export type LandingPageData = z.infer<typeof LandingPageSchema>;
