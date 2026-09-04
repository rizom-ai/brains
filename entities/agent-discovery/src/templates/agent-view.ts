/*
 * Aliases rather than interfaces, deliberately: only an alias gets an implicit
 * index signature, and a data source hands the renderer plain JSON, which
 * means every shape on the way down has to satisfy `JsonObject`.
 */
/* eslint-disable @typescript-eslint/consistent-type-definitions -- see the note above: only a type alias gets an implicit index signature, which is what lets these shapes satisfy `JsonObject` on the way to the renderer */
import { anchorProfileKindSchema } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import type { AgentSkill, AgentStatus } from "../schemas/agent";

type AgentViewMetadata = {
  name: string;
  url: string;
  status: AgentStatus;
  discoveredAt: string | null;
  slug: string;
  repoDid: string | null;
  brainDid: string | null;
  anchorDid: string | null;
  cardUri: string | null;
  cardCid: string | null;
  a2aEndpoint: string | null;
};

type AgentViewFrontmatter = {
  name: string;
  kind: "person" | "team" | "organization";
  organization: string | null;
  brainName: string;
  url: string;
  did: string | null;
  repoDid: string | null;
  brainDid: string | null;
  anchorDid: string | null;
  cardUri: string | null;
  cardCid: string | null;
  a2aEndpoint: string | null;
  introducedBy: string[] | null;
  hops: number | null;
  status: AgentStatus;
  discoveredAt: string;
};

export type AgentSchemaData = {
  id: string;
  entityType: "agent";
  content: string;
  created: string;
  updated: string;
  visibility: "public" | "shared" | "restricted";
  metadata: AgentViewMetadata;
  contentHash: string;
  frontmatter: AgentViewFrontmatter;
  about: string;
  skills: AgentSkill[];
  notes: string;
  url: string | null;
  typeLabel: string | null;
};

const nullableString = z.string().nullable().default(null);
const visibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public" as const;
    if (value === "private") return "restricted" as const;
    return value;
  });
const statusSchema = z.enum(["discovered", "approved", "archived"]);
const skillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});
const frontmatterSchema = z.object({
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
  status: statusSchema,
  discoveredAt: z.string(),
});
const metadataSchema = z.object({
  name: z.string(),
  url: z.url(),
  status: statusSchema,
  discoveredAt: nullableString,
  slug: z.string(),
  repoDid: nullableString,
  brainDid: nullableString,
  anchorDid: nullableString,
  cardUri: nullableString,
  cardCid: nullableString,
  a2aEndpoint: z.url().nullable().default(null),
});

export const agentViewSchema: z.ZodType<AgentSchemaData> = z.object({
  id: z.string(),
  entityType: z.literal("agent"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: visibilitySchema,
  metadata: metadataSchema,
  contentHash: z.string(),
  frontmatter: frontmatterSchema,
  about: z.string(),
  skills: z.array(skillSchema),
  notes: z.string(),
  url: nullableString,
  typeLabel: nullableString,
});

export type AgentView = Omit<AgentSchemaData, "url" | "typeLabel"> & {
  url: string;
  typeLabel: string;
};
