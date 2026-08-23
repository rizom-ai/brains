import { describe, expect, it } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import { studioEntityPath, parseStudioPath } from "../../src/studio-paths";
import { createStudioRouter } from "./studio-router";

describe("Studio browser router", () => {
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
