import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  bodyUnderHeader,
  withFrontmatterSchema,
  withPublishedStatuses,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import type { FetchLike } from "@brains/utils/fetch-like";
import { agentMetadataOf } from "./lib/agent-content";
import { agentGeneration } from "./lib/agent-generation";
import { AGENT_ENTITY_TYPE } from "./lib/constants";
import { agentFrontmatterSchema, agentMetadataSchema } from "./schemas/agent";

const storedAgent = storedDocumentCodec<
  typeof agentFrontmatterSchema,
  typeof agentMetadataSchema
>({
  header: agentFrontmatterSchema,
  deriveMetadata: agentMetadataOf,
  readAsWritten: true,
  // The agent adapter wrote an agent's body from the line under its header.
  prepare: bodyUnderHeader,
});

/**
 * A saved remote peer-brain contact in the local agent directory. Read as
 * its stored document, as the agent adapter read it: its header holds the
 * anchor, card and provenance its metadata does not, and the directory,
 * A2A, the chats and the organization site read its header and its about,
 * skills and notes from its content. Its metadata indexes what the
 * directory lists and looks it up by.
 */
export function agentEntity(
  fetch: FetchLike | undefined,
): EntityDefinition<typeof AGENT_ENTITY_TYPE, typeof agentMetadataSchema> {
  return writesInDocumentOrder(
    withPublishedStatuses(
      withFrontmatterSchema(
        defineEntity({
          type: AGENT_ENTITY_TYPE,
          classification: "system",
          purpose:
            "A saved remote peer-brain contact in the local agent directory.",
          metadata: agentMetadataSchema,
          markdown: storedAgent,
          config: {
            projectionSourceRole: "supporting",
            // Nothing reads these; did and a2aEndpoint duplicate brainDid and url.
            retiredFields: [
              "cardObservedAt",
              "cardLastCheckedAt",
              "a2aEndpoint",
              "did",
              "anchorDid",
            ],
          },
          generation: agentGeneration(fetch),
        }),
        // The header the agent adapter declared: Studio's editor, the vault
        // and frontmatter extensions read it as the type's frontmatter.
        agentFrontmatterSchema,
      ),
      // Approval is the directory's publish gate: production builds publish
      // approved agents' pages, never discovered or archived ones.
      ["approved"],
    ),
  );
}
