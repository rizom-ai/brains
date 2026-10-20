import {
  contentVisibilitySchema,
  entityGroupingSchema,
  ServicePlugin,
  type ServicePluginContext,
  type Tool,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import {
  BOARD_WORKSPACE_ID,
  registerBoardWorkspace,
  trackHref,
} from "./board-workspace";
import { ActionItemInboxSource } from "./inbox-source";
import { createActionItemUpdateTool } from "./tools/action-item-update";

const actionBoardConfigSchema: z.ZodObject<{
  cardVisibility: z.ZodDefault<typeof contentVisibilitySchema>;
  projectGrouping: z.ZodDefault<z.ZodString>;
}> = z.object({
  /** Visibility of cards tracked from the Inbox; match the brain's action items. */
  cardVisibility: contentVisibilitySchema.default("restricted"),
  /** The Studio grouping whose values are projects on the board. */
  projectGrouping: entityGroupingSchema.shape.key.default("projects"),
});

export type ActionBoardConfig = z.output<typeof actionBoardConfigSchema>;
export type ActionBoardConfigInput = z.input<typeof actionBoardConfigSchema>;

/**
 * The team's working surfaces over action items: the Studio Board, blocked
 * items in the Inbox, tracking Inbox items as cards, and moves from chat. The
 * action-item entity itself belongs to conversation memory.
 */
export class ActionBoardPlugin extends ServicePlugin<
  ActionBoardConfig,
  ActionBoardConfigInput
> {
  /** Set once Studio has the Board; the track follow-up links to it. */
  private boardUrl: string | undefined;

  constructor(config: ActionBoardConfigInput = {}) {
    super("action-board", packageJson, config, actionBoardConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (context.executionOnly) return;
    const inboxSource = new ActionItemInboxSource(context);
    context.inbox.registerSource(inboxSource);
    context.inboxFollowUps.registerKind({
      kind: "track-as-action-item",
      label: "Track as action item",
      priority: 15,
      mode: "universal",
      permissionLevel: "trusted",
      applies: ({ sourceId, item }) =>
        this.boardUrl !== undefined &&
        item.entityRef !== undefined &&
        sourceId !== inboxSource.sourceId,
      resolve: ({ sourceId, item }) => {
        const href = this.boardUrl
          ? trackHref(this.boardUrl, sourceId, item)
          : undefined;
        return href ? { href } : undefined;
      },
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    return [createActionItemUpdateTool(this.getContext())];
  }

  // Studio runs in the web process, which alone has a ready phase.
  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    this.boardUrl = await registerBoardWorkspace(context, {
      visibility: this.config.cardVisibility,
      projectGrouping: this.config.projectGrouping,
    });
  }

  protected override async onShutdown(): Promise<void> {
    if (this.boardUrl === undefined) return;
    this.boardUrl = undefined;
    await this.getContext().studio.unregisterWorkspace(BOARD_WORKSPACE_ID);
  }
}

export function actionBoardPlugin(
  config: ActionBoardConfigInput = {},
): ActionBoardPlugin {
  return new ActionBoardPlugin(config);
}
