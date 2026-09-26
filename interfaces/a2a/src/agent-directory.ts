import { z, type InterfaceEntityReader } from "@brains/sdk/interfaces";

const directoryAgentMetadataSchema = z.object({
  name: z.string(),
  url: z.string(),
  status: z.string(),
});

type AgentDirectoryEntrySchema = z.ZodObject<{
  name: z.ZodString;
  url: z.ZodString;
}>;

export const agentDirectoryEntrySchema: AgentDirectoryEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
});

export const agentDirectorySchema: z.ZodObject<{
  agents: z.ZodArray<AgentDirectoryEntrySchema>;
}> = z.object({
  agents: z.array(agentDirectoryEntrySchema),
});

export type AgentDirectory = z.infer<typeof agentDirectorySchema>;

/**
 * Build the public agent directory: minimal name/url pointers to approved,
 * publicly visible peers. Served at /.well-known/agent-directory.json so
 * other brains can sight second-order agents through this one — each
 * pointee's own Agent Card stays the source of truth for everything else.
 */
export async function buildAgentDirectory(
  reader: InterfaceEntityReader,
): Promise<AgentDirectory> {
  if (!reader.getEntityTypes().includes("agent")) {
    return { agents: [] };
  }

  const entities = await reader.listEntities({
    entityType: "agent",
    options: { filter: { visibilityScope: "public" } },
  });

  const agents = entities
    .map((entity) => directoryAgentMetadataSchema.safeParse(entity.metadata))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((metadata) => metadata.status === "approved")
    .map(({ name, url }) => ({ name, url }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { agents };
}
