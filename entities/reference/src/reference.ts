import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withPublishedStatuses,
  withUrlRoute,
} from "@brains/sdk/internal/entity-runtime";
import { referenceCaptureJob } from "./jobs/capture";
import { referenceFromAddress } from "./lib/create-from-address";
import { referenceRepos, type ReferenceNetwork } from "./lib/network";
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
export function referenceEntity(
  network: ReferenceNetwork = {},
): ReferenceDefinition {
  const repos = referenceRepos(network);
  const reference: ReferenceDefinition = withPublishedStatuses(
    withUrlRoute(
      defineEntity({
        type: "reference",
        purpose:
          "A pointer to an entity published on another brain: its title, summary, author and address, never its content.",
        metadata: referenceMetadataSchema,
        // A curator's note here would be public beside the author's words.
        hasBody: false,
        create: {
          fromPrompt: referenceFromAddress,
          fromContent: referenceFromAddress,
        },
        jobs: {
          capture: referenceCaptureJob(() => reference, repos),
        },
        instructions:
          "To feature something another brain published, create a `reference` from its address on the author's own brain. The reference starts as a draft; publishing it is the choice to feature it.",
      }),
      referenceFromAddress,
    ),
    ["published"],
  );
  return reference;
}
