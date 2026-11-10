import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { writesInDocumentOrder } from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown";
import { definedFields } from "@brains/utils/strip-undefined";
import { parsePlaybookBody } from "./playbook-markdown";
import {
  playbookFrontmatterSchema,
  playbookMetadataSchema,
} from "./schemas/playbook";

const PLAYBOOK_INSTRUCTIONS =
  "Playbook entities describe durable, editable guided workflows for the agent. Use them as operating guidance when a playbook run is active; do not treat them as content to publish unless the user explicitly asks. To inspect a playbook's lifecycle, run status, current state, or valid events, call playbook_manage action=status directly; do not use system_search as a substitute.";

/**
 * A playbook: a guided workflow the agent runs with the operator, its
 * steps in the body and its frontmatter its metadata. A file that leaves
 * its status, audience or completion mode unstated reads with their
 * defaults, and its stored document states them, as the playbook adapter
 * wrote it; a body that is not a valid playbook is refused. Its files are
 * written by hand, so a write keeps the order of the frontmatter it
 * replaces.
 */
export const playbookEntity: EntityDefinition<
  "playbook",
  typeof playbookMetadataSchema
> = writesInDocumentOrder(
  defineEntity({
    type: "playbook",
    purpose:
      "A guided multi-step workflow the assistant runs together with the user.",
    classification: "system",
    metadata: playbookMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => ({
        content,
        metadata: definedFields(playbookFrontmatterSchema.parse(frontmatter)),
      }),
      // In the frontmatter schema's order, the defaults stated.
      encode: ({ content, metadata }) => ({
        // The body directly under the frontmatter, as the adapter wrote it.
        content: content.replace(/^\n+/u, ""),
        frontmatter: definedFields({
          title: metadata.title,
          status: metadata.status,
          audience: metadata.audience,
          trigger: metadata.trigger,
          lifecycle: metadata.lifecycle,
          once: metadata.once,
          starterText: metadata.starterText,
          description: metadata.description,
          starterPrompt: metadata.starterPrompt,
          completionMode: metadata.completionMode,
        }),
      }),
    },
    // As the adapter refused one on import: a body that is no playbook.
    validatePersist: ({ content }) => {
      parsePlaybookBody(parseMarkdown(content).content);
    },
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    instructions: PLAYBOOK_INSTRUCTIONS,
  }),
);

export {
  createPlaybookContent,
  parsePlaybookBody,
  parsePlaybookContent,
} from "./playbook-markdown";
export {
  PlaybookBodyFormatter,
  playbookBodyFormatter,
} from "./formatters/playbook-formatter";
export {
  playbookAudienceSchema,
  playbookBodySchema,
  playbookCompletionModeSchema,
  playbookFrontmatterSchema,
  playbookMetadataSchema,
  playbookProofSourceSchema,
  playbookSchema,
  playbookStateSchema,
  playbookStatusSchema,
  playbookTransitionSchema,
  type PlaybookAudience,
  type PlaybookBody,
  type PlaybookCompletionMode,
  type PlaybookEntity,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
  type PlaybookProofSource,
  type PlaybookState,
  type PlaybookStatus,
  type PlaybookTransition,
} from "./schemas/playbook";
export {
  assertValidPlaybookBody,
  validatePlaybookBody,
  type PlaybookValidationResult,
} from "./validation";
