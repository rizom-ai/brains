import {
  anchorProfileKindSchema,
  contentVisibilitySchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { agentSkillSchema, agentStatusSchema } from "../schemas/agent";

const nullableString: z.ZodDefault<z.ZodNullable<z.ZodString>> = z
  .string()
  .nullable()
  .default(null);
const frontmatterSchema: z.ZodObject<{
  name: z.ZodString;
  kind: typeof anchorProfileKindSchema;
  organization: typeof nullableString;
  brainName: z.ZodString;
  url: z.ZodURL;
  did: typeof nullableString;
  repoDid: typeof nullableString;
  brainDid: typeof nullableString;
  anchorDid: typeof nullableString;
  cardUri: typeof nullableString;
  cardCid: typeof nullableString;
  a2aEndpoint: z.ZodDefault<z.ZodNullable<z.ZodURL>>;
  introducedBy: z.ZodDefault<z.ZodNullable<z.ZodArray<z.ZodString>>>;
  hops: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  status: typeof agentStatusSchema;
  discoveredAt: z.ZodString;
}> = z.object({
  name: z.string(),
  kind: anchorProfileKindSchema,
  organization: nullableString,
  brainName: z.string(),
  url: z.url(),
  did: nullableString,
  repoDid: nullableString,
  brainDid: nullableString,
  anchorDid: nullableString,
  cardUri: nullableString,
  cardCid: nullableString,
  a2aEndpoint: z.url().nullable().default(null),
  introducedBy: z.array(z.string()).nullable().default(null),
  hops: z.number().nullable().default(null),
  status: agentStatusSchema,
  discoveredAt: z.string(),
});
const metadataSchema: z.ZodObject<{
  name: z.ZodString;
  url: z.ZodURL;
  status: typeof agentStatusSchema;
  discoveredAt: typeof nullableString;
  slug: z.ZodString;
  repoDid: typeof nullableString;
  brainDid: typeof nullableString;
  anchorDid: typeof nullableString;
  cardUri: typeof nullableString;
  cardCid: typeof nullableString;
  a2aEndpoint: z.ZodDefault<z.ZodNullable<z.ZodURL>>;
}> = z.object({
  name: z.string(),
  url: z.url(),
  status: agentStatusSchema,
  discoveredAt: nullableString,
  slug: z.string(),
  repoDid: nullableString,
  brainDid: nullableString,
  anchorDid: nullableString,
  cardUri: nullableString,
  cardCid: nullableString,
  a2aEndpoint: z.url().nullable().default(null),
});

export const agentViewSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"agent">;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
  visibility: typeof contentVisibilitySchema;
  metadata: typeof metadataSchema;
  contentHash: z.ZodString;
  frontmatter: typeof frontmatterSchema;
  about: z.ZodString;
  skills: z.ZodArray<typeof agentSkillSchema>;
  notes: z.ZodString;
  url: typeof nullableString;
  typeLabel: typeof nullableString;
}> = z.object({
  id: z.string(),
  entityType: z.literal("agent"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string(),
  url: nullableString,
  typeLabel: nullableString,
});

export type AgentSchemaData = z.output<typeof agentViewSchema>;

export type AgentView = Omit<AgentSchemaData, "url" | "typeLabel"> & {
  url: string;
  typeLabel: string;
};
