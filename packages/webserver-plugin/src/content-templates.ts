import { z } from "zod";
import type { ContentTemplate } from "@brains/types";
import { 
  landingPageSchema, 
  landingHeroDataSchema, 
  dashboardSchema 
} from "./content-schemas";

/**
 * Landing page hero section template
 */
export const landingHeroTemplate: ContentTemplate<z.infer<typeof landingHeroDataSchema>> = {
  name: "landing-hero",
  description: "Hero section for landing page",
  schema: landingHeroDataSchema,
  basePrompt: `Generate an engaging hero section for a personal knowledge management system landing page. 
The hero section should have:
- A compelling headline that captures the main value proposition
- A supporting subheadline that provides more context
- Clear call-to-action text that encourages user engagement
- An appropriate CTA link (typically /dashboard or /get-started)

Make the content professional, clear, and action-oriented.`,
};

/**
 * Full landing page template
 */
export const landingPageTemplate: ContentTemplate<z.infer<typeof landingPageSchema>> = {
  name: "landing-page",
  description: "Complete landing page content",
  schema: landingPageSchema,
  basePrompt: `Generate complete landing page content for a personal knowledge management system.
The content should include:
- A concise page title
- A memorable tagline that summarizes the product
- A hero section with:
  - An attention-grabbing headline
  - A descriptive subheadline
  - Compelling call-to-action text
  - An appropriate CTA link

The tone should be professional yet approachable, focusing on the benefits of organizing and discovering knowledge.`,
};

/**
 * Dashboard page template
 */
export const dashboardTemplate: ContentTemplate<z.infer<typeof dashboardSchema>> = {
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
  landingHeroTemplate,
  landingPageTemplate,
  dashboardTemplate,
] as const;