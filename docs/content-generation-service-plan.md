# Content Generation Service Plan

## Overview

This document outlines a general content generation service that provides a unified interface for generating structured content based on Zod schemas. This abstraction moves beyond specific use cases (like landing pages) to support any type of schema-driven content generation including reports, emails, documentation, and more.

## Core Abstraction

The fundamental pattern is:

```
Schema + Prompt + Context → Structured Content
```

This service would be a core shell component, not plugin-specific, enabling any part of the system to generate structured content.

## Service Interface

```typescript
interface ContentGenerationService {
  /**
   * Generate content matching a schema
   */
  async generate<T>(options: {
    schema: z.ZodSchema<T>;
    prompt: string;
    context?: {
      entities?: BaseEntity[];      // Related entities for context
      data?: Record<string, any>;   // Additional data
      examples?: T[];               // Few-shot examples
      style?: string;               // Writing style preferences
    };
  }): Promise<T>;

  /**
   * Generate multiple content pieces
   */
  async generateBatch<T>(options: {
    schema: z.ZodSchema<T>;
    items: Array<{
      prompt: string;
      context?: Record<string, any>;
    }>;
  }): Promise<T[]>;

  /**
   * Stream content generation for large schemas
   */
  async *generateStream<T>(options: {
    schema: z.ZodSchema<T>;
    prompt: string;
    context?: any;
  }): AsyncGenerator<Partial<T>>;

  /**
   * Register reusable templates
   */
  registerTemplate(name: string, template: ContentTemplate): void;

  /**
   * Get registered template
   */
  getTemplate(name: string): ContentTemplate | null;

  /**
   * List all templates
   */
  listTemplates(): ContentTemplate[];
}

interface ContentTemplate {
  name: string;
  description: string;
  schema: z.ZodSchema<any>;
  basePrompt: string;
  examples?: any[];
  defaultContext?: Record<string, any>;
  category?: string;
}
```

## Use Cases

### 1. Website Content (Current)

```typescript
// Register template
contentGen.registerTemplate("landing-hero", {
  name: "landing-hero",
  description: "Hero section for landing page",
  schema: landingHeroSchema,
  basePrompt: "Generate a compelling hero section for a landing page",
  examples: [
    {
      headline: "Welcome to My Digital Brain",
      subheadline: "A personal knowledge management system",
      ctaText: "Get Started",
      ctaLink: "/dashboard",
    },
  ],
});

// Use template
const heroContent = await contentGen.generate({
  schema: landingHeroSchema,
  prompt: "Generate hero section for AI consulting business",
  context: {
    style: "professional, innovative",
  },
});
```

### 2. Weekly Reports

```typescript
const weeklyReportSchema = z.object({
  title: z.string(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  summary: z.string(),
  highlights: z.array(z.string()),
  metrics: z.object({
    notesCreated: z.number(),
    notesUpdated: z.number(),
    tagsUsed: z.array(z.string()),
    topTags: z.array(
      z.object({
        tag: z.string(),
        count: z.number(),
      }),
    ),
  }),
  insights: z.array(
    z.object({
      finding: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  recommendations: z.array(z.string()),
});

const report = await contentGen.generate({
  schema: weeklyReportSchema,
  prompt: "Generate weekly activity report with insights",
  context: {
    entities: await entityService.listEntities("note", {
      filter: { created: { after: lastWeek } },
    }),
    data: {
      startDate: lastWeek,
      endDate: today,
    },
  },
});
```

### 3. Email Newsletters

```typescript
const newsletterSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  greeting: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      highlights: z.array(z.string()),
      callToAction: z
        .object({
          text: z.string(),
          link: z.string(),
        })
        .optional(),
    }),
  ),
  closing: z.string(),
  footer: z.object({
    unsubscribeLink: z.string(),
    preferences: z.string(),
  }),
});

const newsletter = await contentGen.generate({
  schema: newsletterSchema,
  prompt: "Create monthly newsletter about AI insights",
  context: {
    entities: topNotes,
    style: "conversational, engaging, educational",
    data: {
      subscriberName: "Reader",
      month: "January 2024",
    },
  },
});
```

### 4. Project Proposals

```typescript
const proposalSchema = z.object({
  title: z.string(),
  client: z.string(),
  date: z.string(),
  executive_summary: z.string(),
  problem_statement: z.object({
    current_situation: z.string(),
    challenges: z.array(z.string()),
    impact: z.string(),
  }),
  proposed_solution: z.object({
    overview: z.string(),
    approach: z.array(
      z.object({
        phase: z.string(),
        description: z.string(),
        deliverables: z.array(z.string()),
        timeline: z.string(),
      }),
    ),
    benefits: z.array(z.string()),
  }),
  investment: z.object({
    total: z.number(),
    breakdown: z.array(
      z.object({
        item: z.string(),
        cost: z.number(),
        justification: z.string(),
      }),
    ),
    payment_terms: z.string(),
  }),
  next_steps: z.array(z.string()),
});
```

### 5. API Documentation

```typescript
const apiDocSchema = z.object({
  title: z.string(),
  version: z.string(),
  baseUrl: z.string(),
  description: z.string(),
  authentication: z.object({
    type: z.string(),
    description: z.string(),
    example: z.string(),
  }),
  endpoints: z.array(
    z.object({
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      path: z.string(),
      description: z.string(),
      parameters: z.array(
        z.object({
          name: z.string(),
          in: z.enum(["path", "query", "body", "header"]),
          type: z.string(),
          required: z.boolean(),
          description: z.string(),
        }),
      ),
      requestBody: z
        .object({
          contentType: z.string(),
          schema: z.string(),
          example: z.string(),
        })
        .optional(),
      responses: z.array(
        z.object({
          status: z.number(),
          description: z.string(),
          example: z.string(),
        }),
      ),
    }),
  ),
});
```

## Generated Content Entity

The `generated-content` entity type is implemented in the shell package and stores all AI-generated content:

```typescript
interface GeneratedContent extends BaseEntity {
  entityType: "generated-content";
  contentType: string; // e.g., "weekly-report", "newsletter", "landing-hero"
  schemaName: string; // Reference to schema used
  data: Record<string, any>; // The generated content
  metadata: {
    prompt: string; // Original prompt
    context?: any; // Context snapshot
    generatedAt: string; // When generated
    generatedBy?: string; // Which AI model (default: "claude-3-sonnet")
    regenerated?: boolean; // Is this a regeneration?
    previousVersionId?: string; // Link to previous version
  };
}
```

**Note**: This entity type is already implemented with:

- Schema in `@brains/types`
- Adapter in `packages/shell/src/content/generatedContentAdapter.ts`
- Registered in shell initialization

## MCP Tools

```typescript
{
  name: "generate_content",
  description: "Generate content using any registered schema",
  inputSchema: {
    schemaName: z.string().describe("Name of the content schema to use"),
    prompt: z.string().describe("Prompt describing what to generate"),
    context: z.record(z.any()).optional().describe("Additional context"),
    save: z.boolean().default(false).describe("Save as generated-content entity"),
    stream: z.boolean().default(false).describe("Stream the generation"),
  },
  handler: async (input) => {
    const template = contentGen.getTemplate(input.schemaName);
    if (!template) {
      throw new Error(`Unknown schema: ${input.schemaName}`);
    }

    const content = await contentGen.generate({
      schema: template.schema,
      prompt: input.prompt,
      context: input.context,
    });

    if (input.save) {
      const entity = await entityService.createEntity({
        entityType: "generated-content",
        contentType: input.schemaName,
        schemaName: input.schemaName,
        data: content,
        content: JSON.stringify(content, null, 2), // BaseEntity requires content field
        metadata: {
          prompt: input.prompt,
          context: input.context,
          generatedAt: new Date().toISOString(),
          generatedBy: "claude-3-sonnet",
          regenerated: false,
        }
      });

      return { content, entityId: entity.id };
    }

    return { content };
  }
}

{
  name: "list_content_schemas",
  description: "List all available content generation schemas",
  inputSchema: {
    category: z.string().optional().describe("Filter by category"),
  },
  handler: async (input) => {
    const templates = contentGen.listTemplates();
    const filtered = input.category
      ? templates.filter(t => t.category === input.category)
      : templates;

    return filtered.map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      schemaFields: Object.keys(t.schema.shape),
    }));
  }
}

{
  name: "register_content_schema",
  description: "Register a new content generation schema",
  inputSchema: {
    name: z.string(),
    description: z.string(),
    category: z.string().optional(),
    schema: z.record(z.any()).describe("Zod schema definition"),
    basePrompt: z.string(),
    examples: z.array(z.any()).optional(),
  },
  handler: async (input) => {
    // This would need to reconstruct the Zod schema from the definition
    // In practice, schemas might be registered via code
  }
}

{
  name: "regenerate_content",
  description: "Regenerate previously generated content",
  inputSchema: {
    entityId: z.string().describe("ID of generated-content entity"),
    updates: z.object({
      prompt: z.string().optional(),
      context: z.record(z.any()).optional(),
    }).optional(),
  },
  handler: async (input) => {
    const existing = await entityService.getEntity("generated-content", input.entityId);
    if (!existing) {
      throw new Error("Generated content not found");
    }

    const prompt = input.updates?.prompt || existing.metadata.prompt;
    const context = input.updates?.context || existing.metadata.context;

    const template = contentGen.getTemplate(existing.schemaName);
    const newContent = await contentGen.generate({
      schema: template.schema,
      prompt,
      context,
    });

    const updated = await entityService.updateEntity({
      ...existing,
      data: newContent,
      metadata: {
        ...existing.metadata,
        regenerated: true,
        previousVersionId: existing.id,
        generatedAt: new Date().toISOString(),
      }
    });

    return { content: newContent, entityId: updated.id };
  }
}
```

## Integration with Existing Systems

### 1. Schema Registry Integration

```typescript
// Schemas can be registered in the schema registry with metadata
schemaRegistry.register("content/weekly-report", {
  schema: weeklyReportSchema,
  category: "content-generation",
  metadata: {
    template: {
      basePrompt: "Generate a comprehensive weekly report",
      examples: [...],
    }
  }
});
```

### 2. Plugin Integration

```typescript
// Plugins can register their content schemas
export class WebserverPlugin implements Plugin {
  register(context: PluginContext) {
    const contentGen = context.resolve("contentGenerationService");

    // Register all website content schemas
    contentGen.registerTemplate("landing-hero", landingHeroTemplate);
    contentGen.registerTemplate("landing-features", landingFeaturesTemplate);
    contentGen.registerTemplate("about-page", aboutPageTemplate);
  }
}
```

### 3. Query Processor Integration

The content generation service would internally use the query processor:

```typescript
class ContentGenerationService {
  async generate<T>(options: GenerateOptions<T>): Promise<T> {
    // Build enhanced prompt with context
    const enhancedPrompt = this.buildPrompt(options);

    // Use query processor with schema
    const result = await this.queryProcessor.processQuery(enhancedPrompt, {
      schema: options.schema,
      streaming: false,
    });

    return result as T;
  }
}
```

## Benefits

1. **Unified Interface**: Single service for all content generation needs
2. **Schema-Driven**: Type-safe content generation with Zod schemas
3. **Reusable Templates**: Share prompts, examples, and schemas
4. **Extensible**: Plugins can register new content types
5. **Trackable**: All generated content can be saved as entities
6. **Version Control**: Generated content tracked in git via entities
7. **AI-Friendly**: Clear MCP tools for AI assistants
8. **Flexible Context**: Support for entities, data, examples, and style

## Implementation Complexity Analysis

### Existing Infrastructure

The good news is that **95% of the required infrastructure already exists**:

1. **QueryProcessor** (`packages/shell/src/query/queryProcessor.ts`)
   - Already handles AI-powered query processing with schema validation
   - Uses AIService to generate structured responses matching Zod schemas
   - Automatically includes relevant entities in context
   - Returns schema-validated objects directly

2. **AIService** (`packages/shell/src/ai/aiService.ts`)
   - Uses Vercel AI SDK with Anthropic provider
   - Supports both text and structured object generation with schemas
   - Configured for Claude 4 Sonnet by default
   - Handles token usage tracking

3. **Plugin Context**
   - Already provides `query: <T>(query: string, schema: z.ZodType<T>) => Promise<T>`
   - Available to all plugins through their context
   - Delegates to QueryProcessor via the registry

4. **Existing Pattern in Webserver Plugin**
   ```typescript
   // Current usage in ContentGenerator
   const heroData = await this.context.query(
     "Generate compelling hero section content",
     landingHeroDataSchema,
   );
   ```

### What Needs to Be Built

The ContentGenerationService is essentially a **thin orchestration layer** on top of existing infrastructure:

```typescript
class ContentGenerationService {
  constructor(
    private queryProcessor: QueryProcessor,
    private registry: Registry,
    private templates: Map<string, ContentTemplate> = new Map(),
  ) {}

  async generate<T>(options: GenerateOptions<T>): Promise<T> {
    // Build enhanced prompt with template and context
    const template = options.templateName
      ? this.templates.get(options.templateName)
      : null;
    const enhancedPrompt = this.buildPrompt(options, template);

    // Delegate to existing QueryProcessor
    return this.queryProcessor.processQuery(enhancedPrompt, {
      schema: options.schema,
      streaming: false,
    });
  }

  private buildPrompt(
    options: GenerateOptions<T>,
    template?: ContentTemplate,
  ): string {
    let prompt = options.prompt;

    if (template) {
      prompt = `${template.basePrompt}\n\n${prompt}`;

      if (template.examples?.length) {
        prompt += `\n\nExamples:\n${JSON.stringify(template.examples, null, 2)}`;
      }
    }

    if (options.context?.style) {
      prompt += `\n\nStyle: ${options.context.style}`;
    }

    return prompt;
  }

  registerTemplate(name: string, template: ContentTemplate): void {
    this.templates.set(name, template);
  }
}
```

### Implementation Timeline

**Phase 1: Core Service (1-2 days)**

- Create ContentGenerationService class
- Add to shell's service registry
- Implement basic generate method
- Add template registration

**Phase 2: Entity Support (1 day)**

- Create generated-content entity type
- Add adapter using frontmatter utility
- Implement save/load functionality

**Phase 3: MCP Tools (1 day)**

- Implement generate_content tool
- Add list_content_schemas tool
- Create regenerate_content tool

**Phase 4: Migration (1 day)**

- Update webserver plugin to use the service
- Add content generation templates
- Test with existing functionality

**Total: 4-5 days for fully functional service**

### Why It's Easy

1. **No New AI Integration**: AIService already handles everything
2. **No New Schema System**: Zod schemas already integrated
3. **No New Storage**: Entity system ready for generated-content
4. **Clear Pattern**: QueryProcessor shows exactly how to do it
5. **Plugin Ready**: Context.query already available to all plugins

### Challenges

The main challenges are not technical but content-related:

1. **Prompt Engineering**: Crafting effective prompts for consistent results
2. **Template Design**: Creating reusable, flexible templates
3. **Schema Design**: Defining good schemas for different content types
4. **Context Management**: Determining what context to include

## Implementation Priority (Revised)

1. **Core Service** (Day 1-2): Thin wrapper around QueryProcessor
2. **Template System** (Day 2): Simple Map-based template storage
3. **Basic MCP Tool** (Day 3): generate_content tool
4. **Entity Type** (Day 3): generated-content entity and adapter
5. **Additional Tools** (Day 4): list_schemas, regenerate_content
6. **Webserver Migration** (Day 4-5): Update to use new service
7. **Content Templates** (Ongoing): Build library of templates

## Future Enhancements

1. **Schema Versioning**: Handle schema evolution gracefully
2. **Generation History**: Track all generations and regenerations
3. **Quality Scoring**: Rate and improve generated content
4. **Multi-Model Support**: Use different AI models for different content types
5. **Collaborative Generation**: Multiple agents contributing to content
6. **Content Pipelines**: Chain multiple generations together
7. **Validation Rules**: Custom validation beyond Zod schemas
8. **Content Marketplace**: Share templates and schemas with others
