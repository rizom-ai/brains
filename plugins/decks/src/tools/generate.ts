import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, slugify, formatAsEntity } from "@brains/utils";
import { DeckFormatter } from "../formatters/deck-formatter";
import type { DeckEntity } from "../schemas/deck";

/**
 * Input schema for deck:generate tool
 */
export const generateInputSchema = z.object({
  title: z.string().describe("Deck title"),
  content: z
    .string()
    .optional()
    .describe(
      "Slide content in markdown format with slide separators (---). If not provided, creates a minimal template.",
    ),
  description: z.string().optional().describe("Brief description of the deck"),
  author: z.string().optional().describe("Author name"),
  event: z
    .string()
    .optional()
    .describe("Event where presentation will be given"),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create the deck:generate tool
 */
export function createGenerateTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  const formatter = new DeckFormatter();

  return {
    name: `${pluginId}_generate`,
    description: "Create a new deck draft with the provided title and content",
    inputSchema: generateInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const parsed = generateInputSchema.parse(input);

        const slug = slugify(parsed.title);

        // Create default content if not provided
        const content =
          parsed.content ??
          `# ${parsed.title}

---

# Introduction

Add your introduction here

---

# Main Content

Add your main content here

---

# Conclusion

Add your conclusion here`;

        // Build the deck entity
        const now = new Date().toISOString();
        const deckEntity: Omit<DeckEntity, "id" | "created" | "updated"> = {
          entityType: "deck",
          content,
          title: parsed.title,
          description: parsed.description,
          author: parsed.author,
          status: "draft",
          event: parsed.event,
          metadata: {
            slug,
            title: parsed.title,
            status: "draft",
          },
        };

        // Generate markdown with frontmatter
        const markdown = formatter.toMarkdown({
          ...deckEntity,
          id: "temp", // Will be replaced by entity service
          created: now,
          updated: now,
        });

        // Create entity with full data (content includes frontmatter for storage)
        const result = await context.entityService.createEntity({
          ...deckEntity,
          content: markdown,
        });

        const formatted = formatAsEntity(
          {
            id: result.entityId,
            title: parsed.title,
            slug,
            status: "draft",
          },
          { title: "Deck Created" },
        );

        return {
          success: true,
          data: {
            entityId: result.entityId,
            title: parsed.title,
            slug,
          },
          message: `Deck "${parsed.title}" created successfully`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}
