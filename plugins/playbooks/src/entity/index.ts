import type { Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
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

  protected override async getInstructions(): Promise<string> {
    return "Playbook entities describe durable, editable guided workflows for the agent. Use them as operating guidance when a playbook run is active; do not treat them as content to publish unless the user explicitly asks.";
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
