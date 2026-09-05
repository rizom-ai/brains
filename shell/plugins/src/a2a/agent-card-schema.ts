import { z } from "@brains/utils/zod";
import {
  anchorProfileBodySchema,
  profileCategorySchema,
} from "@brains/identity-service";

/**
 * URI for the anchor-profile A2A Agent Card extension.
 */
export const ANCHOR_EXTENSION_URI = "https://rizom.ai/ext/anchor-profile/v1";

/**
 * Shared Zod schemas for parsing A2A Agent Cards.
 * Used by the A2A interface (client) and the agent directory plugin.
 */

export const agentCardSkillSchema: z.ZodObject<{
  id: z.ZodString;
  description: z.ZodString;
  name: z.ZodOptional<z.ZodString>;
  tags: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
}> = z.looseObject({
  id: z.string(),
  description: z.string(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
});

type AnchorExtensionParamsSchema = ReturnType<
  typeof anchorProfileBodySchema.extend<{
    kind: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<typeof profileCategorySchema>;
  }>
>;

export const anchorExtensionParamsSchema: AnchorExtensionParamsSchema =
  anchorProfileBodySchema
    .extend({
      kind: z.string().trim().min(1).optional(),
      category: profileCategorySchema.optional(),
    })
    .superRefine((value, ctx) => {
      if ((value.kind === undefined) !== (value.category === undefined)) {
        ctx.addIssue({
          code: "custom",
          message: "Anchor kind and category must be provided together",
        });
      }
    });

const extensionSchema: z.ZodObject<{
  uri: z.ZodString;
  params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.looseObject({
  uri: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const agentCardSchema: z.ZodObject<{
  name: z.ZodString;
  url: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  skills: z.ZodDefault<z.ZodOptional<z.ZodArray<typeof agentCardSkillSchema>>>;
  capabilities: z.ZodOptional<
    z.ZodObject<{
      extensions: z.ZodDefault<
        z.ZodOptional<z.ZodArray<typeof extensionSchema>>
      >;
    }>
  >;
}> = z.looseObject({
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
  skills: z.array(agentCardSkillSchema).optional().default([]),
  capabilities: z
    .looseObject({
      extensions: z.array(extensionSchema).optional().default([]),
    })
    .optional(),
});

export type AnchorExtensionProfile = z.output<
  typeof anchorExtensionParamsSchema
>;

/**
 * Parsed Agent Card with anchor extension data extracted.
 */
export interface ParsedAgentCard {
  brainName: string;
  url: string;
  description: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
  anchor: AnchorExtensionProfile | null;
}

/**
 * Parse raw Agent Card JSON into a ParsedAgentCard.
 * Extracts the anchor-profile extension if present.
 * Returns null if the data doesn't match the schema.
 */
export function parseAgentCard(data: unknown): ParsedAgentCard | null {
  const parsed = agentCardSchema.safeParse(data);
  if (!parsed.success) return null;

  const card = parsed.data;

  const extensions = card.capabilities?.extensions ?? [];
  const anchorExt = extensions.find(
    (extension) => extension.uri === ANCHOR_EXTENSION_URI,
  );

  let anchor: ParsedAgentCard["anchor"] = null;
  if (anchorExt?.params) {
    const anchorParsed = anchorExtensionParamsSchema.safeParse(
      anchorExt.params,
    );
    if (anchorParsed.success) {
      anchor = anchorParsed.data;
    }
  }

  return {
    brainName: card.name,
    url: card.url,
    description: card.description ?? "",
    skills: card.skills.map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
      description: s.description,
      tags: s.tags,
    })),
    anchor,
  };
}
