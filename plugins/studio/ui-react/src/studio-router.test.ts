import { describe, expect, it } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import {
  studioEntityPath,
  studioWorkspacePath,
  parseStudioPath,
} from "../../src/studio-paths";
import { createStudioRouter, resolveStudioHomePath } from "./studio-router";

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
