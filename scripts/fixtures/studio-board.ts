import { createMockShell } from "@brains/plugins/test";
import {
  createServicePluginContext,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import {
  ActionItemAdapter,
  actionItemSchema,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "@brains/action-items";
import {
  BOARD_WORKSPACE_ID,
  registerBoardWorkspace,
} from "@brains/action-board";

/** Long and short titles in every column: narrow columns must still read. */
const CARDS: ReadonlyArray<{
  id: string;
  text: string;
  status: ActionItemStatus;
  assignee?: string;
}> = [
  {
    id: "partner-update",
    text: "Draft the Q4 partner update for the Foundation board and circulate before Friday",
    status: "open",
    assignee: "Mira Reyes",
  },
  { id: "fix-rss", text: "Fix RSS", status: "open" },
  {
    id: "guest-refusals",
    text: "Review guest chat refusals",
    status: "doing",
    assignee: "Sam Rivera",
  },
  {
    id: "newsletter-archive",
    text: "Migrate the newsletter archive to the new site template",
    status: "blocked",
  },
  { id: "alt-text", text: "Write alt text for decks", status: "done" },
];

/** Seed action items, then read the production Board workspace. */
export async function createBoardFixture(
  now: number,
): Promise<(query: Record<string, string>) => Promise<unknown>> {
  const context = createServicePluginContext(createMockShell(), "action-board");
  const adapter = new ActionItemAdapter();
  context.entities.register("action-item", actionItemSchema, adapter);
  for (const card of CARDS) {
    const metadata: ActionItemMetadata = {
      conversationId: "visual-board",
      channelId: "studio",
      channelName: "studio",
      interfaceType: "studio",
      capturedAt: new Date(now - 2 * 86_400_000).toISOString(),
      status: card.status,
      ...(card.assignee ? { assignedTo: [{ name: card.assignee }] } : {}),
    };
    await context.entityService.createEntity({
      entity: {
        id: card.id,
        entityType: "action-item",
        visibility: "shared",
        content: adapter.composeContent(
          `Action item: ${card.text}`,
          card.text,
          metadata,
        ),
        metadata,
      },
    });
  }
  let registration: StudioWorkspaceRegistration | undefined;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: `/studio/workspaces/${BOARD_WORKSPACE_ID}` },
    };
  });
  await registerBoardWorkspace(context, {
    now: () => new Date(now),
    visibility: "shared",
  });
  const workspace = registration;
  if (!workspace) throw new Error("Board fixture did not register");
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "visual-admin",
    actor: { kind: "user", userId: "visual-admin" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  return (query) => workspace.dataProvider(actor, query);
}
