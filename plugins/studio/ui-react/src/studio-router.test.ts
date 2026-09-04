import { describe, expect, it } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import {
  studioEntityPath,
  studioWorkspacePath,
  parseStudioPath,
} from "../../src/studio-paths";
import {
  STUDIO_CHAT_ROUTE_PATH,
  studioChatWorkspacePath,
} from "../../src/chat-workspace";
import {
  createStudioRouter,
  resolveStudioHomePath,
  resolveStudioWorkspaceAlias,
} from "./studio-router";

describe("Studio browser router", () => {
  it("lands Trusted operators in Overview before entity collections", () => {
    expect(
      resolveStudioHomePath(
        "/studio",
        [{ entityType: "note", isSingleton: false }],
        [{ id: "studio:account" }, { id: "studio:overview" }],
      ),
    ).toBe(studioWorkspacePath("/studio", "studio:overview"));

    expect(
      resolveStudioHomePath("/studio", [], [{ id: "studio:account" }]),
    ).toBe(studioWorkspacePath("/studio", "studio:account"));
  });

  it("resolves retired workspace ids to canonical tabbed deep links", () => {
    expect(
      resolveStudioWorkspaceAlias(
        "/studio",
        "admin:people",
        "?selected=person-1&tab=audit",
        [
          {
            id: "admin:administration",
            aliases: [{ id: "admin:people", query: { tab: "people" } }],
          },
        ],
      ),
    ).toBe(
      `${studioWorkspacePath("/studio", "admin:administration")}?selected=person-1&tab=people`,
    );
  });

  it("matches canonical Chat without rewriting it to a workspace path", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/chat?session=thread-1"],
    });
    const router = createStudioRouter("/studio", undefined, history);
    await router.load();

    expect(router.state.matches.length).toBeGreaterThan(0);
    expect(history.location.pathname).toBe(STUDIO_CHAT_ROUTE_PATH);
    expect(studioChatWorkspacePath("/studio", "thread-1")).toBe(
      "/chat?session=thread-1",
    );
  });

  it("uses the configured base and replays Back and Forward entries", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/studio/entities/post"],
    });
    const router = createStudioRouter("/studio", undefined, history);
    await router.load();

    history.push(studioEntityPath("/studio", "post", "field-notes"));
    expect(parseStudioPath(history.location.pathname, "/studio")).toEqual({
      kind: "entity",
      entityType: "post",
      id: "field-notes",
    });

    history.back();
    expect(history.location.pathname).toBe("/studio/entities/post");
    history.forward();
    expect(history.location.pathname).toBe("/studio/entities/post/field-notes");
  });
});
