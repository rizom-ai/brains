import {
  defineEntity,
  frontmatterInContent,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { playbookMetadataOf } from "./adapters/playbook-adapter";
import {
  playbookMetadataSchema,
  type PlaybookMetadata,
} from "./schemas/playbook";

/**
 * A playbook is written by hand and read by the agent.
 *
 * Its file keeps its own frontmatter, because someone opens it in a vault
 * and the header is part of the document they see — so the codec merges
 * metadata over what the file carries rather than replacing it. It is
 * excluded from projection for the same reason it is not content: a
 * playbook is operating guidance, not something the brain publishes.
 */
export const playbookEntity: EntityDefinition<
  "playbook",
  typeof playbookMetadataSchema
> = defineEntity({
  type: "playbook",
  purpose:
    "A guided multi-step workflow the assistant runs together with the user.",
  metadata: playbookMetadataSchema,
  config: { projectionSource: false, projectionSourceRole: "excluded" },
  markdown: frontmatterInContent<PlaybookMetadata>(playbookMetadataOf),
  instructions:
    "Playbook entities describe durable, editable guided workflows for the agent. Use them as operating guidance when a playbook run is active; do not treat them as content to publish unless the user explicitly asks. To inspect a playbook's lifecycle, run status, current state, or valid events, call playbooks_manage with action=status directly; do not use system_search as a substitute.",
});

export type PlaybookEntity = EntityOf<typeof playbookEntity>;

export {
  parsePlaybookBody,
  parsePlaybookContent,
  playbookMetadataOf,
} from "./adapters/playbook-adapter";
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
  playbookStateSchema,
  playbookStatusSchema,
  playbookTransitionSchema,
  type PlaybookAudience,
  type PlaybookBody,
  type PlaybookCompletionMode,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
  type PlaybookState,
  type PlaybookStatus,
  type PlaybookTransition,
} from "./schemas/playbook";
export {
  assertValidPlaybookBody,
  validatePlaybookBody,
  type PlaybookValidationResult,
} from "./validation";
