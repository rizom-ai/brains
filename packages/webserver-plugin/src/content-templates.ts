import type { z } from "zod";
import type { ContentTemplate } from "@brains/types";
import {
  landingHeroDataSchema,
  featuresSectionSchema,
  ctaSectionSchema,
  dashboardSchema,
} from "./content-schemas";
import { HeroSectionFormatter } from "./formatters/heroSectionFormatter";
import { FeaturesSectionFormatter } from "./formatters/featuresSectionFormatter";
import { CTASectionFormatter } from "./formatters/ctaSectionFormatter";

/**
 * Hero section template
 */
export const heroSectionTemplate: ContentTemplate<
  z.infer<typeof landingHeroDataSchema>
> = {
  name: "hero-section",
  description: "Hero section for pages",
  schema: landingHeroDataSchema,
  formatter: new HeroSectionFormatter(),
  basePrompt: `Generate an engaging hero section for a personal knowledge management system. 
The hero section should have:
- A compelling headline that captures the main value proposition
- A supporting subheadline that provides more context
- Clear call-to-action text that encourages user engagement
- An appropriate CTA link (typically /dashboard or /get-started)

Make the content professional, clear, and action-oriented.`,
};

/**
 * Features section template
 */
export const featuresSectionTemplate: ContentTemplate<
  z.infer<typeof featuresSectionSchema>
> = {
  name: "features-section",
  description: "Features section for pages",
  schema: featuresSectionSchema,
  formatter: new FeaturesSectionFormatter(),
  basePrompt: `Generate a features section for a personal knowledge management system.
The features section should have:
- A clear label (typically "Features")
- A compelling headline that highlights the key benefits
- A brief description that summarizes what the system offers
- Exactly 3 feature cards, where each feature includes:
  - An icon (choose from: brain, lightning, lock, check, chart, users, rocket)
  - A concise title (2-4 words)
  - A brief description (1-2 sentences explaining the benefit)

Focus on the core value propositions of knowledge management: organization, searchability, security, and intelligence.
Make the features concrete and benefit-oriented.`,
};

/**
 * CTA section template
 */
export const ctaSectionTemplate: ContentTemplate<
  z.infer<typeof ctaSectionSchema>
> = {
  name: "cta-section",
  description: "Call-to-action section for pages",
  schema: ctaSectionSchema,
  formatter: new CTASectionFormatter(),
  basePrompt: `Generate a compelling call-to-action section for a personal knowledge management system.
The CTA section should have:
- A persuasive headline that creates urgency or excitement
- A supporting description that reinforces the value
- A primary button object with:
  - "text" field: Action-oriented text (e.g., "Start Free Trial", "Get Started Now")
  - "link" field: Appropriate link (e.g., "/signup", "/demo")
- An optional secondary button object with:
  - "text" field: Alternative action text (e.g., "View Demo", "Learn More")
  - "link" field: Appropriate link

Make it compelling and action-oriented. Remember that buttons must be objects with "text" and "link" fields, not strings.`,
};

/**
 * Dashboard page template
 */
export const dashboardTemplate: ContentTemplate<
  z.infer<typeof dashboardSchema>
> = {
  name: "dashboard",
  description: "Dashboard page content with statistics",
  schema: dashboardSchema,
  basePrompt: `Generate dashboard page content for a knowledge management system.
The content should include:
- An appropriate dashboard title
- A brief description of what the dashboard shows
- Statistics object with realistic placeholder values
- A list of 3-5 recent entities with sample data

The tone should be informative and focused on providing quick insights.`,
};

/**
 * All webserver content templates
 */
export const webserverContentTemplates = [
  // Section templates
  heroSectionTemplate,
  featuresSectionTemplate,
  ctaSectionTemplate,
  // Page templates
  dashboardTemplate,
] as const;
