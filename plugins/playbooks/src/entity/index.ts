import { playbookSeedContract } from "@brains/contracts";
import type {
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
} from "@brains/plugins";
import { EntityPlugin, internalFullScope } from "@brains/plugins";
import {
  playbookAdapter,
  type PlaybookAdapter,
} from "./adapters/playbook-adapter";
import { playbookSchema, type PlaybookEntity } from "./schemas/playbook";
import {
  playbookConfigSchema,
  type PlaybookConfig,
  type PlaybookConfigInput,
} from "./schemas/playbook-config";
import packageJson from "../../package.json";

const playbookEntityType = "playbook";

export class PlaybookPlugin extends EntityPlugin<
  PlaybookEntity,
  PlaybookConfig,
  PlaybookConfigInput
> {
  readonly entityType: typeof playbookEntityType = playbookEntityType;
  readonly schema: typeof playbookSchema = playbookSchema;
  readonly adapter: PlaybookAdapter = playbookAdapter;

  constructor(config: PlaybookConfigInput = {}) {
    super("playbook", packageJson, config, playbookConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Another package plants a playbook it bundles through the type's
    // steward: only where none with that id exists at any visibility, so a
    // seed never overwrites what an owner wrote.
    context.messaging.answer(playbookSeedContract, async ({ id, markdown }) => {
      const existing = await context.entityService.getEntity({
        entityType: playbookEntityType,
        id,
        visibilityScope: internalFullScope(
          "bundled playbook seed existence check",
        ),
      });
      if (existing) return { created: false };
      await context.entityService.createEntityFromMarkdown({
        input: { entityType: playbookEntityType, id, markdown },
      });
      return { created: true };
    });
  }

  protected override async getInstructions(): Promise<string> {
    return "Playbook entities describe durable, editable guided workflows for the agent. Use them as operating guidance when a playbook run is active; do not treat them as content to publish unless the user explicitly asks. To inspect a playbook's lifecycle, run status, current state, or valid events, call playbook_manage action=status directly; do not use system_search as a substitute.";
  }
}

export function playbookPlugin(config: PlaybookConfigInput = {}): Plugin {
  return new PlaybookPlugin(config);
}

export { PlaybookAdapter, playbookAdapter } from "./adapters/playbook-adapter";
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
  playbookConfigSchema,
  type PlaybookConfig,
  type PlaybookConfigInput,
} from "./schemas/playbook-config";
export {
  assertValidPlaybookBody,
  validatePlaybookBody,
  type PlaybookValidationResult,
} from "./validation";
