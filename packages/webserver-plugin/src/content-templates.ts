import type { z } from "zod";
import type { ContentTemplate } from "@brains/types";
import {
  landingPageReferenceSchema,
  landingHeroDataSchema,
  featuresSectionSchema,
  ctaSectionSchema,
  dashboardSchema,
} from "./content-schemas";
import { LandingPageFormatter } from "./formatters/landingPageFormatter";
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
  basePrompt: `Generate a features section for a personal knowledge management system with the following structure:

- label: Should be "Features"
- headline: Create a compelling headline about the product's value proposition
- description: Write a brief description of what makes these features special
- features: An array of 3-4 feature objects, each containing:
  - icon: One of "lightning", "lock", "check", "chart", "users", "brain", "rocket"
  - title: A short, descriptive feature title
  - description: A 1-2 sentence description of the feature
  - colorScheme (optional): One of "purple", "orange", "teal"

Focus on benefits like speed, security, ease of use, and collaboration.`,
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
 * Landing page template (references sections)
 */
export const landingPageTemplate: ContentTemplate<
  z.infer<typeof landingPageReferenceSchema>
> = {
  name: "landing-page",
  description: "Landing page configuration with section references",
  schema: landingPageReferenceSchema,
  formatter: new LandingPageFormatter(),
  basePrompt: `Generate landing page configuration for a personal knowledge management system.
This should include:
- A concise page title
- A memorable tagline that summarizes the product
- References to the hero, features, and CTA sections (these will be generated separately)

Note: The actual sections (hero, features, CTA) are generated as separate entities.`,
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
  landingPageTemplate,
  dashboardTemplate,
] as const;
