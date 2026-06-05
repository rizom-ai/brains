import type { Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { playbookAdapter } from "./adapters/playbook-adapter";
import {
  playbookConfigSchema,
  playbookSchema,
  type PlaybookConfig,
  type PlaybookEntity,
} from "./schemas/playbook";
import packageJson from "../package.json";

export class PlaybookPlugin extends EntityPlugin<
  PlaybookEntity,
  PlaybookConfig
> {
  readonly entityType = playbookAdapter.entityType;
  readonly schema = playbookSchema;
  readonly adapter = playbookAdapter;

  constructor(config: Partial<PlaybookConfig> = {}) {
    super("playbook", packageJson, config, playbookConfigSchema);
  }

  protected override async getInstructions(): Promise<string> {
    return "Playbook entities describe durable, editable guided workflows for the agent. Use them as operating guidance when a playbook run is active; do not treat them as content to publish unless the user explicitly asks.";
  }
}

export function playbookPlugin(config: Partial<PlaybookConfig> = {}): Plugin {
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
  playbookConfigSchema,
  playbookExpectedEntitySchema,
  playbookFrontmatterSchema,
  playbookMetadataSchema,
  playbookSchema,
  playbookStateSchema,
  playbookStatusSchema,
  playbookTransitionSchema,
  type PlaybookAudience,
  type PlaybookBody,
  type PlaybookCompletionMode,
  type PlaybookConfig,
  type PlaybookEntity,
  type PlaybookExpectedEntity,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
  type PlaybookState,
  type PlaybookStatus,
  type PlaybookTransition,
} from "./schemas/playbook";
