# Webserver Plugin Extension Plan

## Overview

Extend the webserver plugin to support:

1. **General Section** - Context provider that generates data for other sections
2. **Products Section** - Showcase products/projects dynamically
3. **Better Content Flow** - General context informs all other sections

## Architecture

### Content Generation Flow

```
1. Generate General Context (not displayed)
   ↓
2. Pass context to all sections
   ↓
3. Each section uses general context for consistency
```

## Implementation Structure

### 1. Add General Context Section

#### Schema Definition

```typescript
// packages/webserver-plugin/src/content/general/schema.ts
import { z } from "zod";

export const generalContextSchema = z.object({
  // Core identity
  organizationName: z.string().describe("Name of the organization"),
  tagline: z.string().describe("Short memorable tagline"),
  mission: z.string().describe("Mission statement"),
  vision: z.string().describe("Vision statement"),

  // Key values/principles
  values: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .min(3)
    .max(5)
    .describe("Core values"),

  // Brand voice/tone
  tone: z
    .enum(["professional", "casual", "academic", "playful"])
    .describe("Brand voice and tone"),

  // Key themes
  themes: z.array(z.string()).min(3).max(6).describe("Key themes and topics"),

  // Target audience
  audience: z.object({
    primary: z.string().describe("Primary target audience"),
    secondary: z.string().optional().describe("Secondary audience"),
  }),

  // Core offerings/focus areas
  focusAreas: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Main focus areas or offerings"),
});

export type GeneralContext = z.infer<typeof generalContextSchema>;
```

#### Content Template

```typescript
// packages/webserver-plugin/src/content/general/index.ts
import type { ContentTemplate } from "@brains/types";
import { generalContextSchema, type GeneralContext } from "./schema";

export const generalContextTemplate: ContentTemplate<GeneralContext> = {
  name: "general-context",
  description:
    "General organizational context that informs all content generation",
  schema: generalContextSchema,
  basePrompt: `You are creating the foundational context for an organization's website.
  
Analyze the available content and generate:
- Organization name and identity
- Clear mission and vision statements
- 3-5 core values with descriptions
- Appropriate brand tone
- Key themes (3-6)
- Target audience definition
- Main focus areas (3-6)

This context will be used to ensure consistency across all generated content.
Make it authentic and aligned with the organization's actual work.`,
};
```

### 2. Add Products Section

#### Schema Definition

```typescript
// packages/webserver-plugin/src/content/landing/products/schema.ts
import { z } from "zod";

export const productSchema = z.object({
  id: z.string().describe("Unique identifier"),
  name: z.string().describe("Product name"),
  tagline: z.string().describe("Short memorable tagline"),
  description: z.string().describe("Brief description"),
  status: z
    .enum(["live", "beta", "alpha", "concept"])
    .describe("Development status"),
  link: z.string().optional().describe("Link to product or docs"),
  icon: z.string().describe("Icon identifier"),
});

export const productsSectionSchema = z.object({
  label: z.string().describe("Section label"),
  headline: z.string().describe("Section headline"),
  description: z.string().describe("Section description"),
  products: z
    .array(productSchema)
    .min(1)
    .max(6)
    .describe("Product showcase items"),
});

export type Product = z.infer<typeof productSchema>;
export type ProductsSection = z.infer<typeof productsSectionSchema>;
```

#### Content Template

```typescript
// packages/webserver-plugin/src/content/landing/products/index.ts
import type { ContentTemplate } from "@brains/types";
import { productsSectionSchema, type ProductsSection } from "./schema";

export const productsSectionTemplate: ContentTemplate<ProductsSection> = {
  name: "products-section",
  description: "Products and projects showcase section",
  schema: productsSectionSchema,
  basePrompt: `Generate a products section showcasing the organization's key offerings.

Context will be provided about:
- Organization name and mission
- Core values
- Focus areas
- Target audience

Based on this context and available content, create:
- A section label (e.g., "Our Products", "What We Build", "Our Ecosystem")
- A compelling headline that showcases the products
- A brief description of the product portfolio
- 3-6 products with:
  - Unique memorable names
  - Clear taglines that explain value
  - Concise descriptions (1-2 sentences)
  - Appropriate development status
  - Relevant icon names (use simple identifiers like "brain", "network", "tools")
  - Optional links if mentioned in content

Ensure products align with the organization's mission and values.
Make them concrete and understandable to the target audience.`,
};
```

#### Formatter

```typescript
// packages/webserver-plugin/src/content/landing/products/formatter.ts
import type { SchemaFormatter } from "@brains/types";
import type { ProductsSection } from "./schema";

export class ProductsSectionFormatter
  implements SchemaFormatter<ProductsSection>
{
  format(data: ProductsSection): string {
    let output = `## ${data.headline}\n\n`;
    output += `${data.description}\n\n`;

    for (const product of data.products) {
      output += `### ${product.name}\n`;
      output += `*${product.tagline}*\n\n`;
      output += `${product.description}\n\n`;
      output += `**Status:** ${product.status}\n`;
      if (product.link) {
        output += `**Link:** [View →](${product.link})\n`;
      }
      output += `\n`;
    }

    return output;
  }

  canFormat(data: unknown): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      "products" in data &&
      Array.isArray((data as any).products)
    );
  }
}
```

### 3. Update Landing Page Schema

```typescript
// packages/webserver-plugin/src/content/landing/index/schema.ts
import { z } from "zod";
import { landingHeroDataSchema } from "../hero/schema";
import { featuresSectionSchema } from "../features/schema";
import { productsSectionSchema } from "../products/schema"; // NEW
import { ctaSectionSchema } from "../cta/schema";

export const landingPageSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  hero: landingHeroDataSchema,
  features: featuresSectionSchema,
  products: productsSectionSchema, // NEW
  cta: ctaSectionSchema,
});

export type LandingPageData = z.infer<typeof landingPageSchema>;
```

### 4. Update Content Registry

```typescript
// packages/webserver-plugin/src/content/registry.ts
import { productsSectionTemplate } from "./landing/products";
import { generalContextTemplate } from "./general";

export class ContentRegistry {
  constructor() {
    // Register general context (not displayed, but used by other sections)
    this.register("webserver:general", generalContextTemplate);

    // Register landing page as a collection with its items
    const landingCollection: ContentTemplate<unknown> = {
      ...landingPageTemplate,
      items: {
        metadata: landingMetadataTemplate,
        hero: heroSectionTemplate,
        features: featuresSectionTemplate,
        products: productsSectionTemplate, // NEW
        cta: ctaSectionTemplate,
      },
    };
    this.register("webserver:landing", landingCollection);

    // Register dashboard
    this.register("webserver:dashboard", dashboardTemplate);
  }
}
```

### 5. Update Generation Flow

```typescript
// packages/webserver-plugin/src/webserver-manager.ts
// In generateContent method

async generateContent(sendProgress?: ProgressCallback, force = false): Promise<void> {
  const totalSteps = this.contentRegistry.getTemplateKeys().length + 1;
  let currentStep = 0;

  // Step 1: Generate general context first
  await sendProgress?.({
    message: "Generating organizational context...",
    progress: currentStep++,
    total: totalSteps,
  });

  const generalResult = await this.generateContentForSection(
    "webserver:general",
    "preview",
    force
  );

  // Extract the general context for use in other sections
  let generalContext = {};
  if (generalResult.generated && generalResult.entityId) {
    const generalEntity = await this.context.entityService.getEntity(
      "site-content",
      generalResult.entityId
    );
    if (generalEntity) {
      generalContext = JSON.parse(generalEntity.content);
    }
  }

  // Step 2: Generate other sections with general context
  for (const templateKey of this.contentRegistry.getTemplateKeys()) {
    if (templateKey === "webserver:general") continue; // Skip general

    await sendProgress?.({
      message: `Generating ${templateKey}...`,
      progress: currentStep++,
      total: totalSteps,
    });

    // Pass general context to content generation
    await this.generateContentForSection(
      templateKey,
      "preview",
      force,
      sendProgress,
      generalContext // Pass context here
    );
  }
}

// Update generateContentForSection to accept context
async generateContentForSection(
  templateKey: string,
  environment: "preview" | "production",
  force = false,
  sendProgress?: ProgressCallback,
  generalContext?: unknown
): Promise<{ generated: boolean; entityId?: string }> {
  // ... existing code ...

  // When calling content generation service, include general context
  const generated = await contentGenService.generateFromTemplate(
    templateKey,
    {
      entities: relevantEntities,
      generalContext, // Include general context
      environment,
      timestamp: new Date().toISOString(),
    }
  );

  // ... rest of method
}
```

### 6. Update Section Prompts

Update all section prompts to reference the general context:

```typescript
// Example: Hero Section
export const heroSectionTemplate: ContentTemplate<LandingHeroData> = {
  name: "hero-section",
  description: "Landing page hero section",
  schema: landingHeroDataSchema,
  basePrompt: `Generate a hero section for the landing page.

General Context:
{generalContext}

Based on the organization's identity and mission, create:
- A headline that captures the essence (use the tagline as inspiration)
- A subheadline that expands on the value proposition
- CTA text that invites the primary audience to engage
- CTA link (use #features or #products)

Ensure the tone matches: {generalContext.tone}
Focus on the primary audience: {generalContext.audience.primary}`,
};
```

## Example Content for Rizom

### General Context

```yaml
organizationName: "Rizom Collective"
tagline: "Decentralized Collective Intelligence"
mission: "To build resilient, interconnected systems for knowledge sharing and collaborative intelligence"
vision: "A world where collective wisdom emerges from decentralized networks of minds and machines"
values:
  - name: "Decentralization"
    description: "No single point of failure in knowledge or governance"
  - name: "Emergence"
    description: "Complex intelligence arising from simple interactions"
  - name: "Openness"
    description: "Transparent processes and shared knowledge"
  - name: "Resilience"
    description: "Systems that adapt and grow stronger"
  - name: "Collaboration"
    description: "Working together across boundaries"
tone: "casual"
themes:
  - "collective intelligence"
  - "decentralized systems"
  - "knowledge networks"
  - "human-AI collaboration"
  - "open source"
  - "emergent systems"
audience:
  primary: "Technologists and thinkers interested in collective intelligence"
  secondary: "Organizations seeking decentralized knowledge solutions"
focusAreas:
  - "Knowledge Management Systems"
  - "Collective Intelligence Tools"
  - "Decentralized Protocols"
  - "Open Source Software"
  - "Research & Development"
```

### Products Section

```yaml
label: "Our Ecosystem"
headline: "Tools for Collective Intelligence"
description: "Open source projects that enable decentralized knowledge networks"
products:
  - id: "personal-brain"
    name: "Personal Brain"
    tagline: "Your AI-augmented second brain"
    description: "Open source knowledge management system that learns from your thinking patterns and helps you make connections."
    status: "beta"
    link: "https://github.com/rizom/personal-brain"
    icon: "brain"

  - id: "collective-graph"
    name: "Collective Graph"
    tagline: "Connect minds across the network"
    description: "Protocol for federated knowledge sharing that preserves privacy while enabling collective intelligence."
    status: "concept"
    icon: "network"

  - id: "think-together"
    name: "Think Together"
    tagline: "Real-time collaborative thinking"
    description: "Multiplayer mind mapping tool with AI-powered synthesis and idea evolution tracking."
    status: "alpha"
    link: "https://think.rizom.io"
    icon: "users"

  - id: "knowledge-commons"
    name: "Knowledge Commons"
    tagline: "Shared wisdom repository"
    description: "Community-curated knowledge base with version control and collective governance."
    status: "live"
    link: "https://commons.rizom.io"
    icon: "book"
```

## Implementation Benefits

1. **Consistency**: All sections share the same organizational context
2. **Flexibility**: Easy to add new sections that use general context
3. **Maintainability**: Update general context → all sections stay aligned
4. **AI Quality**: Clear context improves generation accuracy
5. **Extensibility**: Can add more context fields as needed

## Next Steps

1. Implement the schema and template files
2. Update the content registry
3. Modify generation flow to handle context
4. Update existing section prompts
5. Create Astro components for products section
6. Test with Rizom content
7. Deploy and iterate

## Future Improvements

### Content Generation Plugin Refactoring

After completing the site-builder decoupling, we should:

1. **Extract ContentGeneratingPlugin to its own package** (`@brains/content-generation`)

   - Move from `@brains/utils` to dedicated package
   - Better separation of concerns
   - Easier to maintain and version

2. **Add array-based template registration pattern** to ContentGeneratingPlugin:

   ```typescript
   // In ContentGeneratingPlugin base class
   protected registerContentTemplates(templates: Array<{
     key: string;
     template: ContentTemplate<any>;
   }>): void {
     for (const { key, template } of templates) {
       if (template.formatter) {
         this.registerContentType(key, {
           schema: template.schema,
           contentType: key,
           formatter: template.formatter,
         });
       }
     }
   }
   ```

3. **Benefits**:
   - Reduces boilerplate in plugins that register many templates
   - Consistent pattern across all content-generating plugins
   - Easier to add/remove templates
   - Better type safety with const arrays

This refactoring should be done after the current site-builder decoupling is complete to avoid disrupting the current work.
