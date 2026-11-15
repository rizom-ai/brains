import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { createActionBoardPlugins } from "./board-plugins";

describe("the action board", () => {
  it("offers to track Inbox items on the Board once the Board is open", async () => {
    const shell = createMockShell();
    const plugins = createActionBoardPlugins();
    for (const plugin of plugins) await plugin.register(shell);
    shell
      .getMessageBus()
      .subscribe<{ id: string }, { workspaceUrl: string }>(
        "studio:register-workspace",
        async () => ({
          success: true,
          data: {
            workspaceUrl: "/studio/workspaces/action-board%3Aboard",
          },
        }),
      );
    const followUps = shell.getInboxFollowUpRegistry();
    followUps.finalize();
    const contact = {
      id: "req-1",
      title: "Could we share your field notes?",
      summary: "Grace asks about our field notes.",
      receivedAt: "2026-10-15T10:12:00.000Z",
      urgency: "normal" as const,
      entityRef: { entityType: "contact-request", entityId: "req-1" },
      actions: [],
    };
    const trusted = { permissionLevel: "trusted" as const };
    const tracking = async (
      sourceId: string,
      item: typeof contact | Omit<typeof contact, "entityRef">,
    ): Promise<string | undefined> =>
      (
        await followUps.resolveUniversal({ sourceId, item, actor: trusted })
      ).find((followUp) => followUp.kind === "track-as-action-item")?.href;

    expect(await tracking("contact-requests", contact)).toBeUndefined();

    for (const plugin of plugins) await plugin.ready?.();

    const href = await tracking("contact-requests", contact);
    expect(href?.startsWith("/studio/workspaces/action-board%3Aboard?")).toBe(
      true,
    );
    const query = new URL(href ?? "", "https://brain.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      trackSource: "contact-requests",
      trackType: "contact-request",
      trackId: "req-1",
      trackTitle: "Could we share your field notes?",
      trackSummary: "Grace asks about our field notes.",
    });
    expect(await tracking("action-items", contact)).toBeUndefined();
    const { entityRef: _entityRef, ...unreferenced } = contact;
    expect(await tracking("contact-requests", unreferenced)).toBeUndefined();
  });
});
