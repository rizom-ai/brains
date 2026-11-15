import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { entityGroupingSchema } from "@brains/sdk/internal/entity-runtime";
import { contentVisibilitySchema } from "@brains/sdk/internal/presentation";
import {
  serviceRuntime,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { boardContextOf, type BoardContext } from "./board-context";
import {
  BOARD_WORKSPACE_ID,
  registerBoardWorkspace,
  trackHref,
} from "./board-workspace";
import { ActionItemInboxSource } from "./inbox-source";
import { createActionItemCreateTool } from "./tools/action-item-create";
import { createActionItemUpdateTool } from "./tools/action-item-update";

export const actionBoardConfigSchema: z.ZodObject<{
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

/** What the action board holds once set up. */
export interface ActionBoardState {
  readonly board: BoardContext;
  /** The brain's members, whom cards can be assigned to. */
  readonly members: () => Promise<readonly { id: string; name: string }[]>;
}

/**
 * The team's working surfaces over action items: the Studio Board, blocked
 * items in the Inbox, tracking Inbox items as cards, and moves from chat. The
 * action-item entity itself belongs to conversation memory.
 */
export const actionBoardPackage: ServicePackageDefinition<
  typeof actionBoardConfigSchema
> = withTools<typeof actionBoardConfigSchema, ActionBoardState>(
  defineServicePlugin({
    id: "action-board",
    config: actionBoardConfigSchema,
    setup: (context): ActionBoardState => {
      const { config } = context;
      const runtime = serviceRuntime(context);
      const board = boardContextOf(runtime);
      const members = (): Promise<readonly { id: string; name: string }[]> =>
        runtime.assignableMembers();
      /** Set once Studio has the Board; the track follow-up links to it. */
      let boardUrl: string | undefined;
      if (!runtime.executionOnly) {
        const inboxSource = new ActionItemInboxSource(board);
        runtime.inboxSource(inboxSource);
        runtime.inboxFollowUpKind({
          kind: "track-as-action-item",
          label: "Track as action item",
          priority: 15,
          mode: "universal",
          permissionLevel: "trusted",
          applies: ({ sourceId, item }) =>
            boardUrl !== undefined &&
            item.entityRef !== undefined &&
            sourceId !== inboxSource.sourceId,
          resolve: ({ sourceId, item }) => {
            const href = boardUrl
              ? trackHref(boardUrl, sourceId, item)
              : undefined;
            return href ? { href } : undefined;
          },
        });
      }
      // Studio runs in the web process, which alone has a ready phase.
      runtime.ready(async () => {
        boardUrl = await registerBoardWorkspace(board, {
          visibility: config.cardVisibility,
          projectGrouping: config.projectGrouping,
          members,
        });
      });
      context.lifecycle.onCleanup(async () => {
        if (boardUrl === undefined) return;
        boardUrl = undefined;
        await board.studio.unregister(BOARD_WORKSPACE_ID);
      });
      return { board, members };
    },
  }),
  ({ config, state }) => [
    createActionItemCreateTool(state.board, {
      visibility: config.cardVisibility,
      members: state.members,
    }),
    createActionItemUpdateTool(state.board),
  ],
);
