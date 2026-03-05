import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z, slugify } from "@brains/utils";
import { WishAdapter } from "../adapters/wish-adapter";
import {
  wishStatusSchema,
  wishPrioritySchema,
  type WishEntity,
} from "../schemas/wish";
import { findExistingWish } from "../lib/wish-dedup";
import { sortWishesByDemand } from "../lib/sort-wishes";

const addSchema = z.object({
  title: z.string().describe("Short title for the wish"),
  description: z
    .string()
    .describe("What the user wanted and why it's not possible yet"),
  priority: wishPrioritySchema.optional().describe("Defaults to medium"),
  tags: z.array(z.string()).optional().describe("Categorization tags"),
});

const listSchema = z.object({
  status: wishStatusSchema.optional().describe("Filter by status"),
  priority: wishPrioritySchema.optional().describe("Filter by priority"),
});

const updateSchema = z.object({
  id: z.string().describe("Wish entity ID (slug)"),
  status: wishStatusSchema.optional(),
  priority: wishPrioritySchema.optional(),
  declinedReason: z
    .string()
    .optional()
    .describe("Reason for declining (when status is declined)"),
});

export function createWishlistTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  const adapter = new WishAdapter();

  return [
    createTypedTool(
      pluginId,
      "add",
      "Log an unfulfilled user request to the wishlist. Use this whenever you cannot fulfill a request — whether the feature doesn't exist, it requires real-world actions, or it's outside your capabilities. If a similar wish already exists, its request count is incremented.",
      addSchema,
      async (input) => {
        const existing = await findExistingWish(
          {
            search: (query, options) =>
              context.entityService.search<WishEntity>(query, options),
            getEntity: (entityType, id) =>
              context.entityService.getEntity<WishEntity>(entityType, id),
            similarityThreshold: 0.85,
          },
          { title: input.title, description: input.description },
        );

        if (existing) {
          const { frontmatter, description } = adapter.parseWishContent(
            existing.content,
          );
          const newRequested = frontmatter.requested + 1;
          const updatedContent = adapter.createWishContent(
            { ...frontmatter, requested: newRequested },
            description,
          );

          await context.entityService.updateEntity({
            ...existing,
            content: updatedContent,
            metadata: { ...existing.metadata, requested: newRequested },
          });

          return {
            success: true,
            data: {
              id: existing.id,
              existed: true,
              requested: newRequested,
            },
            message: `This wish is already on the wishlist — requested ${newRequested} times.`,
          };
        }

        const slug = slugify(input.title);
        const content = adapter.createWishContent(
          {
            title: input.title,
            status: "new",
            priority: input.priority ?? "medium",
            requested: 1,
            tags: input.tags ?? [],
          },
          input.description,
        );

        await context.entityService.createEntity({
          id: slug,
          entityType: "wish",
          content,
          metadata: {
            title: input.title,
            status: "new",
            priority: input.priority ?? "medium",
            requested: 1,
            slug,
          },
        });

        return {
          success: true,
          data: { id: slug, existed: false, requested: 1 },
          message: `Added "${input.title}" to the wishlist.`,
        };
      },
      { visibility: "trusted" },
    ),

    createTypedTool(
      pluginId,
      "list",
      "List wishes from the wishlist, optionally filtered by status or priority. Shows title, status, priority, and how many times each was requested.",
      listSchema,
      async (input) => {
        const allWishes = await context.entityService.listEntities<WishEntity>(
          "wish",
          {
            limit: 1000,
          },
        );

        let wishes = allWishes;
        if (input.status) {
          wishes = wishes.filter((w) => w.metadata.status === input.status);
        }
        if (input.priority) {
          wishes = wishes.filter((w) => w.metadata.priority === input.priority);
        }

        sortWishesByDemand(wishes);

        return {
          success: true,
          data: wishes.map((w) => ({
            id: w.id,
            title: w.metadata.title,
            status: w.metadata.status,
            priority: w.metadata.priority,
            requested: w.metadata.requested,
          })),
        };
      },
      { visibility: "trusted" },
    ),

    createTypedTool(
      pluginId,
      "update",
      "Update a wish's status or priority. Only the brain owner can do this.",
      updateSchema,
      async (input) => {
        const existing = await context.entityService.getEntity<WishEntity>(
          "wish",
          input.id,
        );

        if (!existing) {
          return {
            success: false,
            error: `Wish not found: ${input.id}`,
          };
        }

        const { frontmatter, description } = adapter.parseWishContent(
          existing.content,
        );

        const updatedFrontmatter = {
          ...frontmatter,
          ...(input.status && { status: input.status }),
          ...(input.priority && { priority: input.priority }),
          ...(input.declinedReason && {
            declinedReason: input.declinedReason,
          }),
        };

        const updatedContent = adapter.createWishContent(
          updatedFrontmatter,
          description,
        );

        const updatedMetadata = {
          ...existing.metadata,
          ...(input.status && { status: input.status }),
          ...(input.priority && { priority: input.priority }),
        };

        await context.entityService.updateEntity({
          ...existing,
          content: updatedContent,
          metadata: updatedMetadata,
        });

        return {
          success: true,
          data: { id: input.id, ...updatedMetadata },
          message: `Updated wish "${frontmatter.title}".`,
        };
      },
      { visibility: "anchor" },
    ),
  ];
}
