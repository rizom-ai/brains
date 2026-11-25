import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withPublishedStatuses,
  withUrlRoute,
} from "@brains/sdk/internal/entity-runtime";
import { referenceCaptureJob } from "./jobs/capture";
import { referenceFromAddress } from "./lib/create-from-address";
import type { PublicRepoReader } from "@brains/atproto-client";
import { referenceMetadataSchema } from "./schemas/reference";

export type ReferenceDefinition = EntityDefinition<
  "reference",
  typeof referenceMetadataSchema
>;

/**
 * A pointer to an entity another brain publishes: its display fields and
 * where it lives, never its body. It is captured from the address a curator
 * gives, starts as a draft, and is featured by publishing it. The author
 * keeps the entity on their own brain, and the reference links to it there.
 */
export function referenceEntity(repos: PublicRepoReader): ReferenceDefinition {
  const reference: ReferenceDefinition = withPublishedStatuses(
    withUrlRoute(
      defineEntity({
        type: "reference",
        purpose:
          "A pointer to an entity published on another brain: its title, summary, author and address, never its content.",
        metadata: referenceMetadataSchema,
        // A curator's note here would be public beside the author's words.
        hasBody: false,
        // Fields and nothing under them: stored as a YAML file.
        config: { storage: "yaml" },
        create: {
          fromPrompt: referenceFromAddress,
          fromContent: referenceFromAddress,
        },
        jobs: {
          capture: referenceCaptureJob(() => reference, repos),
        },
        instructions:
          "A `reference` features something another brain published, on this brain's site: create one from the piece's address on its author's own brain. It starts as a draft, and publishing it is the choice to feature it. Saving a web page to read or cite later is a `link`, not a reference.",
      }),
      referenceFromAddress,
    ),
    ["published"],
  );
  return reference;
}
